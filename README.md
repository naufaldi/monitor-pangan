# Monitor Pangan

Peta, tabel, dan tren harga pangan strategis Indonesia per provinsi. Dashboard ini
tidak berafiliasi dengan penyedia data. Harga PIHPS dan laporan warga memiliki
jalur data terpisah.

## Fitur dan batas data

- Peta dan tabel PIHPS dengan pilihan komoditas/tanggal yang dapat dibagikan lewat
  URL, ekspor CSV, serta halaman rincian provinsi.
- Grafik riwayat, perubahan harga, dan perbandingan provinsi.
- Daya Beli membandingkan UMP 2026 (Rp/bulan) dengan harga rata-rata provinsi
  (Rp/kg atau Rp/liter). Bundel UMP sudah diperiksa silang; verifikasi nomor SK
  setiap provinsi belum tuntas. Hasil ini bukan ukuran pendapatan semua warga.
- Status pembaruan membedakan observasi harga terakhir, waktu pemeriksaan layanan,
  menunggu publikasi, dan gangguan pembaruan. Cakupan provinsi mengikuti snapshot
  komoditas/tanggal yang dipilih. Data yang hilang tetap kosong, bukan nol.
- Laporan warga dapat dikirim dengan foto opsional dan ditinjau moderator.
  Tautan tanda terima privat menampilkan status menunggu, ditinjau, atau ditolak.
  Simpan tautan tersebut; siapa pun yang memilikinya dapat melihat status.
  Tautan ini tidak memberi akses ke foto, alias, atau catatan internal moderator.
- `/admin` adalah meja moderasi dengan autentikasi terpisah. Laporan warga tidak
  pernah menjadi harga PIHPS atau masukan perhitungan Daya Beli.

Harga PIHPS adalah pengamatan resmi yang dipublikasikan sumber, bukan survei
langsung aplikasi ini. Harga provinsi merangkum kabupaten/kota yang disurvei;
provinsi tanpa observasi tidak diberi harga buatan. Label `Data contoh` selalu
berarti data contoh, bukan harga resmi. Tanggal observasi tidak sama dengan
waktu pemeriksaan layanan.

## Pengembangan lokal

Gunakan Node 24 dan pnpm sesuai `packageManager` pada `package.json`.

```sh
pnpm install
pnpm dev                                # Vite, http://localhost:3001
pnpm typecheck
pnpm test src/data/health-client.test.ts  # tes dengan target eksplisit
pnpm build
```

`pnpm typecheck`, tes yang terdampak, dan `pnpm build` adalah pemeriksaan perubahan
kode. CI menjalankan seluruh suite. Jangan menjalankan suite dalam watch mode.

Vite menjalankan antarmuka dan menyediakan bundel snapshot/riwayat yang masuk
repo. Vite sendiri tidak menjalankan endpoint Worker, D1, Turnstile, atau R2.
Tanpa API lokal, UI dapat menampilkan data bundel dengan peringatan pembaruan;
permintaan riwayat yang tidak ada di bundel dan kiriman warga memerlukan Worker.
Data lokal yang tersedia tidak membuktikan keadaan produksi.

## Runtime Worker lokal

Worker Cloudflare (`src/worker/index.ts`) menyajikan aset hasil build, endpoint
snapshot/tren/health, dan laporan warga. D1 menyimpan harga, bukti pemeriksaan,
dan laporan. R2 menyimpan foto. Worker dapat menyisipkan pembaruan harga dalam
HTML dengan batas waktu; pembacaan health di browser tidak menghalangi render.

```sh
pnpm db:setup                    # schema dan seed di D1 lokal saja
pnpm build
pnpm exec wrangler dev --local --port 8787
```

Seed lokal bukan seluruh arsip historis. Untuk memulihkan riwayat, ikuti
[runbook PIHPS](docs/operations/pihps.md) dan gunakan target lokal yang eksplisit.
Database kosong, cakupan belum diperiksa, dan observasi kosong mempunyai makna
berbeda. Jangan menyimpulkan harga nol atau kelengkapan data dari respons kosong.

Konfigurasi lokal sensitif berada di `.dev.vars` yang diabaikan Git. Laporan
memerlukan konfigurasi Turnstile; unggahan foto juga memerlukan konfigurasi R2.
Jangan menyalin secret ke repo. Setup lokal tidak melakukan deploy, konfigurasi
produksi, atau pengisian ulang data produksi. Operasi infrastruktur personal dari
perangkat perusahaan harus mengikuti kebijakan perusahaan; gunakan perangkat
personal yang tidak dikelola untuk operasi yang dilarang kebijakan BYOD.

## Struktur dan dokumentasi

- `src/`: aplikasi TanStack Start/Router + React; `src/data/provider.ts` adalah
  kontrak harga yang dibaca UI.
- `packages/ui/`: komponen dan token UI bersama, diimpor dari `@monitor-pangan/ui`.
- `src/worker/`, `db/schema.sql`: Worker, penyimpanan, dan schema.
- [CONTEXT.md](CONTEXT.md): istilah domain dan batas makna harga.
- [DATA_SOURCES.md](DATA_SOURCES.md): asal data, keterbatasan, dan privasi laporan.
- [Operasional PIHPS](docs/operations/pihps.md): setup lokal, health, pemulihan, dan
  batas bukti lokal versus produksi.
- [Sinkronisasi arsip](docs/operations/pihps-archive-sync.md) dan
  [arsip historis](data/history/pihps/README.md): riwayat dan alur sinkronisasi.
- Dokumen di `docs/superpowers/` adalah rancangan historis. Dokumen tersebut bukan
  workflow aktif atau bukti bahwa deployment/pemulihan produksi sudah dilakukan.

Peta: `indonesia-geodata` (MIT). Tile: kontributor OpenStreetMap.
