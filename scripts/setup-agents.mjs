import * as Fs from "node:fs"
import * as Path from "node:path"

const source = ".agents/AGENTS.md"
const target = "AGENTS.md"

try {
  const stat = Fs.lstatSync(target)
  if (stat.isSymbolicLink() && Fs.readlinkSync(target) === source) {
    process.exit(0)
  }
  console.error(`Refusing to overwrite existing ${target}`)
  process.exit(1)
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error
  }
  Fs.symlinkSync(source, target, "file")
  console.log(`Linked ${target} -> ${Path.resolve(source)}`)
}
