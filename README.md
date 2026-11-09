# CRK PID Dashboard

Dashboard pengembangan produk untuk section **Product Innovation Development (PID)**, PT Citarasa Kuliner Indonesia (CRK Group). Mendigitalkan whiteboard SO-PID-010: 7 stage (Pencarian Ide → Komersialisasi), 4 kategori (Varian Cimol, Minuman, Online Food, New Brand), SLA per stage, launch calendar, vendor list, dan reporting read-only untuk Direksi / All Divisi.

Stack: FastAPI + MongoDB (backend), React + Vite + Tailwind (frontend, mobile-first), APScheduler (reminder), satu `Dockerfile` untuk Railway.

## Struktur
```
backend/app/      FastAPI: main.py (API), domain.py (stage, SLA, rumus), services.py (dashboard, weekly text),
                  jobs.py (digest, nudge, weekly, backup, email), seed.py (data whiteboard), auth.py (PIN)
backend/tests/    Acceptance test dari build spec (pytest)
frontend/src/     App.jsx (shell + bottom nav), overview.jsx (tile, calendar, pipeline, funnel, SLA),
                  pages/ (Login, Beranda, Proyek, ProjectDetail, Keputusan, Vendor, Saya + Panel Admin, Laporan)
Dockerfile        Build frontend lalu backend menyajikan file statis
railway.json      Healthcheck /api/health
```

## Jalankan lokal
```bash
# backend (data di memori)
cd backend && pip install -r requirements.txt
USE_MOCK_DB=true UPLOAD_DIR=./data/uploads uvicorn app.main:app --reload --port 8000

# frontend (terminal lain) → http://localhost:5173
cd frontend && npm install && npm run dev

# test
cd backend && pytest -q
```

## Go-live Railway
1. Push repo ini ke GitHub `handry-crk/PIDDashboard` → Railway **New Project → Deploy from GitHub**.
2. **+ New → Database → MongoDB**, lalu di service app set `MONGO_URL` (reference ke MongoDB) dan `USE_MOCK_DB=false`.
3. Set variables (lihat `.env.example`): `SECRET_KEY`, `DEFAULT_ADMIN_PIN`, `METRICS_API_KEY`, `PUBLIC_BASE_URL`, `TZ=Asia/Jakarta`, dan `RESEND_API_KEY` atau `SMTP_*`.
4. Tambah **Volume** mount di `/data` (foto prototipe & backup), lalu redeploy.
5. PID Head register pertama (otomatis Admin) → Saya → Panel Admin → **Import data whiteboard**.
6. Cek Settings: cadence slot, SLA, kriteria screening, target food cost. Undang Supervisor, Staff, Viewer.
7. Copy link Reporting dari Panel Admin untuk Direksi / All Divisi.

Logo: taruh `logo.png` (transparan) di `frontend/public/` agar tampil di header; bila tidak ada, header hanya menampilkan teks CRK GROUP.

## Role
| Role | Akses |
|---|---|
| PID Head | Semua, keputusan Go / Revisi / Drop (stage IV, VI, VII), Settings, slot |
| PID Supervisor | Buat & edit proyek, kandidat, scoring, vendor, pindah/skip stage |
| PID Staff / R&D | Isi stage V (BOM, foto, SOP) dan VI (hasil uji), komentar |
| Viewer | Read-only + komentar |
User pertama = Admin. Admin PIN fallback default `1234` (ubah di Panel Admin).

## API penting
- `GET /api/health`
- `GET /api/report?t=<shareToken>` — payload Reporting publik (tanpa HPP, BOM, vendor)
- `GET /api/public-metrics?key=<METRICS_API_KEY>` — untuk Service Excellence Dashboard / Daily Tracker
- `POST /api/jobs/{digest|nudge|weekly|backup}/run` — jalankan manual (PID Head/Admin)

## Jadwal otomatis (WIB, cek tiap 15 menit, sekali per hari)
Nudge supervisor 09:00 hari kerja · Daily digest 17:00 hari kerja · Weekly Update Senin 08:30 · Backup Minggu 02:00 (8 file terakhir di `/data/backups`).

## Catatan
- Upload disimpan di volume `/data/uploads` (S3 belum diaktifkan; lihat Iterasi di build spec).
- Tanpa SMTP/Resend, email tidak terkirim tetapi teks digest/weekly tetap tampil di Panel Admin dan Reporting.
