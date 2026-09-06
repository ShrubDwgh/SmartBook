# SmartBook

Aplikasi catatan pribadi berbasis proyek dengan **AI Secretary** — fokus utamanya membuat pencatatan proyek sederhana dan tidak ribet.

## Ringkasan arsitektur

```
Frontend (HTML/CSS/JS statis)
   │  (hanya Firebase Auth, untuk dapat ID token)
   ▼
Backend — Vercel Serverless Functions (/api)
   │                                  │
   ▼                                  ▼
Firestore (via Admin SDK)        OpenAI API (via OPENAI_API_KEY)
```

Frontend **tidak pernah** mengakses Firestore atau OpenAI secara langsung. Semua data (proyek, catatan, checklist, secrets) dibaca/ditulis lewat endpoint di `/api`, yang memverifikasi Firebase ID token lalu memakai Firebase Admin SDK di server. Ini persis mengikuti diagram di spesifikasi awal, dan sekaligus menyederhanakan keamanan: `firestore.rules` cukup menolak semua akses client langsung (lihat file itu), karena satu-satunya jalan masuk ke database adalah lewat backend ini.

## Struktur proyek

```
smartbook/
├── api/                # Vercel Serverless Functions (backend, 1 file = 1 endpoint)
│   ├── projects/
│   ├── notes/
│   ├── tasks/
│   ├── categories/
│   ├── secrets/
│   ├── ai/secretary.js # Chat + tool-calling AI Secretary
│   └── backup/export.js
├── lib/                 # Logic bisnis & akses Firestore, dipakai bersama oleh /api
├── public/              # Frontend statis, tanpa build step
│   ├── index.html
│   ├── css/styles.css
│   └── js/               # ES modules (dashboard, projects, notes, secretary, secrets, settings, router, ...)
├── firestore.rules
├── package.json
├── vercel.json
└── .env.example
```

## Persiapan

- Node.js 18+ dan npm
- Akun [Firebase](https://console.firebase.google.com) (gratis)
- Akun [OpenAI](https://platform.openai.com) dengan API key
- Akun [Vercel](https://vercel.com) + Vercel CLI: `npm i -g vercel`

## 1. Setup Firebase

1. Buat project baru di Firebase Console.
2. **Authentication** → Sign-in method → aktifkan **Email/Password**.
3. **Firestore Database** → Create database (mode apa saja; `firestore.rules` di repo ini akan menutup akses langsung dari client, jadi mode "production" maupun "test" sama-sama aman begitu rules ini di-deploy).
4. **Project Settings → Service Accounts** → "Generate new private key" → unduh file JSON-nya (**jangan** commit file ini ke git). Dari isi JSON tersebut, salin ke `.env` Anda (lihat `.env.example`):
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (biarkan karakter `\n` apa adanya di dalam tanda kutip)
5. **Project Settings → General** → scroll ke "Your apps" → tambah **Web app** → salin object `firebaseConfig` yang muncul ke `public/js/firebase-init.js` (ganti nilai `GANTI_DENGAN_...`).
   > Nilai-nilai ini (`apiKey`, dst) **aman berada di kode publik** — ini bukan kredensial rahasia seperti `OPENAI_API_KEY`. Keamanan aplikasi ditegakkan oleh verifikasi token & pengecekan kepemilikan data di backend, bukan dengan menyembunyikan config ini.
6. Deploy `firestore.rules`. Cara termudah: buka **Firestore → Rules** di console, tempel isi file `firestore.rules`, klik **Publish**. (Alternatif: `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules`.)

## 2. Setup OpenAI

Buat API key di platform.openai.com, isi ke `OPENAI_API_KEY`. Model default adalah `gpt-4o-mini` (murah, cepat, mendukung *function calling*) — bisa diganti lewat `OPENAI_MODEL` kapan saja tanpa mengubah kode.

## 3. Environment variables

Salin `.env.example` menjadi `.env` untuk pengembangan lokal, lalu isi semua nilainya. Untuk `SECRETS_ENCRYPTION_KEY`, generate dengan:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Untuk production, set env var yang sama di Vercel: **Project → Settings → Environment Variables**, atau lewat CLI: `vercel env add NAMA_VARIABEL`.

## 4. Menjalankan secara lokal

```bash
npm install
vercel dev
```

Buka `http://localhost:3000`. `vercel dev` menjalankan frontend statis dan seluruh fungsi di `/api` sekaligus, dengan environment variable dari `.env`/`.env.local`.

## 5. Deploy ke Vercel

**Lewat CLI:**
```bash
vercel        # deploy preview, ikuti prompt untuk link/buat project
vercel --prod # deploy production
```

**Lewat GitHub** (alternatif): push folder ini ke sebuah repo, lalu import di [vercel.com/new](https://vercel.com/new). Jangan lupa isi Environment Variables di pengaturan project sebelum deploy pertama.

## Skema database (Firestore)

Semua koleksi hanya pernah disentuh oleh backend (Admin SDK); setiap dokumen menyimpan `ownerId` yang selalu dicocokkan dengan uid dari token yang terverifikasi.

| Koleksi | Field penting |
|---|---|
| `projects/{id}` | `ownerId`, `name`, `description`, `status` (`Aktif`/`Selesai`, **otomatis**), `progress` (0–100, **otomatis**), `createdAt`, `updatedAt` |
| `tasks/{id}` | `ownerId`, `projectId`, `title`, `completed`, `sourceNoteId` (jika berasal dari catatan "tandai sebagai tugas") |
| `notes/{id}` | `ownerId`, `projectId`, `title`, `content`, `category`, `tags[]`, `isTask`, `linkedTaskId` |
| `secrets/{id}` | `ownerId`, `label`, `type`, `encryptedValue`, `iv`, `authTag` (nilai asli **tidak pernah** disimpan plaintext) |
| `userSettings/{uid}` | `categories[]` — di-seed otomatis dengan 8 kategori default saat pertama dipakai |
| `rateLimits/{uid_key}` | dipakai internal untuk membatasi laju panggilan ke AI Secretary |

`status` dan `progress` proyek **tidak bisa diubah manual** lewat API — keduanya murni dihitung ulang dari checklist setiap kali sebuah task dibuat/diubah/dihapus (lihat `lib/tasksService.js`), supaya nilainya tidak pernah menyimpang dari checklist yang sebenarnya.

## Daftar endpoint API

Semua endpoint butuh header `Authorization: Bearer <Firebase ID token>`.

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/projects` | GET, POST | List / buat proyek |
| `/api/projects/:id` | GET, PUT, DELETE | Detail (+checklist+catatan) / ubah / hapus (cascade) |
| `/api/notes` | GET, POST | Cari/list (`?search=&projectId=&category=&tag=`) / buat |
| `/api/notes/:id` | GET, PUT, DELETE | Detail / ubah / hapus |
| `/api/tasks` | GET, POST | List checklist per proyek (`?projectId=`) / buat |
| `/api/tasks/:id` | PUT, DELETE | Ubah (termasuk toggle selesai) / hapus |
| `/api/categories` | GET, POST | List / `{action:'add'\|'rename'\|'delete', name, newName}` |
| `/api/secrets` | GET, POST | List metadata (tanpa nilai asli) / buat |
| `/api/secrets/:id` | PUT, DELETE, POST | Ubah / hapus / **reveal** (POST, butuh login baru-baru ini) |
| `/api/ai/secretary` | POST | `{message, history}` → chat dengan AI Secretary |
| `/api/backup/export` | GET | Export seluruh data (tanpa Secrets) sebagai JSON |

## Keputusan keamanan yang penting diketahui

- **uid selalu dari token, tidak pernah dari input.** Setiap endpoint memverifikasi Firebase ID token dan memakai `uid` hasil verifikasi untuk semua query — bukan dari body/query/argumen. Ini juga berlaku untuk tool-call AI Secretary, sehingga isi catatan yang jahat (prompt injection) tidak mungkin membuat AI membaca/mengubah data user lain.
- **AI Secretary tidak diberi tool ke Secrets Vault sama sekali** (lihat `lib/aiTools.js`) — bukan cuma "diminta untuk tidak", tapi memang tidak ada jalan teknis baginya untuk mengaksesnya.
- **Reveal secret butuh bukti login dalam 10 menit terakhir** (klaim `auth_time` di ID token). Jika lewat, backend menolak dengan kode `reauth_required` dan frontend meminta konfirmasi ulang kata sandi sebelum mencoba lagi.
- **Enkripsi AES-256-GCM** untuk isi Secrets Vault, kunci di `SECRETS_ENCRYPTION_KEY` (env var backend, tidak pernah di database/kode).
- **Backup sengaja tidak menyertakan Secrets** — supaya file backup yang tersimpan/terkirim di tempat kurang aman tidak ikut membocorkan password/API key Anda.
- Error 5xx selalu dibalas dengan pesan generik ke client (detail asli hanya masuk ke log server) supaya tidak membocorkan informasi internal.

## Beberapa penyederhanaan yang disengaja

Sesuai instruksi "pilih solusi paling sederhana, aman, dan mudah dirawat" untuk hal yang tidak dirinci di spesifikasi:

- **Pencarian** memakai satu filter `ownerId` ke Firestore, sisanya (proyek/kategori/tag/teks) difilter di memori server. Ini sengaja dipilih supaya **tidak perlu composite index Firestore sama sekali** — cukup cepat untuk skala catatan pribadi, dan jauh lebih mudah dirawat.
- **Rate limiting** untuk AI Secretary dibuat sendiri lewat Firestore (tanpa layanan tambahan seperti Redis), cukup untuk mencegah bug/penyalahgunaan membengkakkan biaya OpenAI.
- **Riwayat chat AI Secretary** hanya disimpan di memori browser (hilang saat reload tab), tidak dipersist ke server — sesuai spesifikasi yang tidak meminta fitur riwayat chat permanen.
- Login memakai **Email/Password** Firebase Auth (termasuk "lupa kata sandi"). Tidak ada verifikasi email wajib — bisa ditambahkan belakangan bila diperlukan.
- Jika ingin SmartBook ini benar-benar hanya untuk satu orang, cara termudah adalah tidak membagikan tautan pendaftarannya, atau menonaktifkan sign-up baru dari Firebase Console setelah akun pertama dibuat.

## Mengganti model AI

Ubah `OPENAI_MODEL` di environment variables (mis. ke model lain yang mendukung *tools*/function calling) — tidak perlu mengubah kode sama sekali.
