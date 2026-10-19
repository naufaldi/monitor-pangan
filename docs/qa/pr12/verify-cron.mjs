// Controlled local scheduler evidence. No network source or persistent application DB.
// rtk pnpm exec node --experimental-strip-types docs/qa/pr12/verify-cron.mjs
import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { Cause, Effect, Exit, Layer, Option, TestClock, TestContext } from 'effect'
import { d1PriceStoreLayer, ensureMigrated } from '../../../src/worker/d1-store.ts'
import { handleScheduled, handleRequest, workerLayer } from '../../../src/worker/index.ts'
import { PihpsFetchError, PihpsSource } from '../../../src/worker/ingest.ts'
import { tradingDaysFromThrough } from '../../../src/lib/civil-date.ts'
const reports=[]
const runCase=(name,at,coveredThrough,outcome,expectedTarget,expectedState)=>Effect.gen(function*(){
 const sqlite=new DatabaseSync(':memory:')
 const prepare=(sql,values=[])=>({bind:(...values)=>prepare(sql,values),all:()=>Promise.resolve({results:sqlite.prepare(sql).all(...values)}),run:()=>Promise.resolve({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})})
 const db={prepare,batch:statements=>{sqlite.exec('BEGIN');return Promise.all(statements.map(s=>Promise.resolve().then(()=>s.run()))).then(r=>{sqlite.exec('COMMIT');return r},e=>{sqlite.exec('ROLLBACK');return Promise.reject(e)})},exec:sql=>Promise.resolve(sqlite.exec(sql))}
 yield* ensureMigrated(db)
 for(const date of tradingDaysFromThrough('2026-09-17',coveredThrough))sqlite.prepare("INSERT INTO source_days VALUES (?,'pihps','live','2026-10-16T10:15:00Z')").run(date)
 sqlite.prepare("INSERT INTO prices_daily(date,commodity_id,region_code,price,source_id,level) VALUES (?,'beras','31',15000,'pihps','eceran')").run(coveredThrough)
 sqlite.prepare("INSERT INTO job_runs(started_at,source_id,status) VALUES ('2026-10-15T10:15:00Z','pihps','complete')").run()
 yield* TestClock.setTime(at)
 const targets=[];let published=outcome==='live'
 const source=Layer.succeed(PihpsSource,{fetchGrid:date=>{targets.push(date);if(outcome==='failed')return Effect.fail(new PihpsFetchError({message:'controlled upstream failure'}));const [y,m,d]=date.split('-');return Effect.succeed({data:published?[{name:'Beras',level:1,[`${d}/${m}/${y}`]:'16,000'}]:[]})}})
 const env={DB:db,ASSETS:{fetch:()=>Promise.resolve(new Response('fixture asset'))},PHOTOS:{get:()=>Promise.resolve(null),put:()=>Promise.resolve(),delete:()=>Promise.resolve()}}
 const invoke=()=>handleScheduled().pipe(Effect.provide(Layer.mergeAll(d1PriceStoreLayer(db),source)),Effect.exit)
 const invocations=[]
 const capture=(result)=>Effect.gen(function*(){const response=yield* handleRequest(new Request('https://local-fixture.test/api/pihps/health')).pipe(Effect.provide(workerLayer(env)));const health=yield* Effect.promise(()=>response.json());const day=sqlite.prepare("SELECT date,status FROM source_days WHERE date=?").get(expectedTarget);const job=sqlite.prepare('SELECT started_at,status,rows_upserted,note FROM job_runs ORDER BY id DESC LIMIT 1').get();invocations.push({triggerAt:at,outcome:Exit.isSuccess(result)?'resolved':Option.getOrNull(Cause.failureOption(result.cause))?._tag,day,job,healthStatus:response.status,health})})
 yield* capture(yield* invoke())
 if(outcome==='delayed'){published=true;at='2026-10-19T10:15:00Z';yield* TestClock.setTime(at);yield* capture(yield* invoke())}
 const last=invocations.at(-1);assert.equal(last.day.status,expectedState);assert.equal(last.job.status,outcome==='failed'?'error':'complete');assert.ok(targets.every(d=>d===expectedTarget));assert.equal(last.health.status,outcome==='failed'?'degraded':'ok');assert.equal(last.health.oldestUnresolvedDate,outcome==='failed'?expectedTarget:null)
 if(outcome==='delayed'){assert.equal(invocations[0].day.status,'pending');assert.equal(invocations[0].health.status,'waiting');assert.equal(targets.length,68)}
 reports.push({name,clock:'Effect TestClock',source:'synthetic controlled source service',sourceCalls:targets.length,target:expectedTarget,invocations});sqlite.close()
})
Effect.runPromise(Effect.gen(function*(){
 yield* runCase('Friday live','2026-10-16T07:15:00Z','2026-10-15','live','2026-10-16','live')
 yield* runCase('Monday live skips weekend','2026-10-19T07:15:00Z','2026-10-16','live','2026-10-19','live')
 yield* runCase('Monday delayed publication','2026-10-19T07:15:00Z','2026-10-16','delayed','2026-10-19','live')
 yield* runCase('Monday failed source','2026-10-19T10:15:00Z','2026-10-16','failed','2026-10-19','error')
 writeFileSync('docs/qa/pr12/cron-verification.json',JSON.stringify({kind:'Production handleScheduled and HTTP dispatcher, controlled Effect services and real isolated SQLite; not Wrangler cron HTTP or production event',noSourceHttp:true,productionWrites:false,reports},null,2)+'\n')
 console.log(JSON.stringify(reports.map(r=>({name:r.name,sourceCalls:r.sourceCalls,target:r.target,outcomes:r.invocations.map(i=>({outcome:i.outcome,day:i.day.status,job:i.job.status,health:i.health.status}))}))))
}).pipe(Effect.provide(TestContext.TestContext)))
