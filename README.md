# Kakarama Room Analytics Dashboard

Dasbor analitik untuk manajemen sewa apartemen. Next.js 15, TypeScript, TailwindCSS, arsitektur dual-database (Supabase Cloud + PostgreSQL lokal).

## Fitur

- **Pemantauan KPI** — pendapatan, transaksi, okupansi, ketersediaan unit
- **Analitik Pendapatan** — grafik interaktif dengan filter periode (harian, mingguan, bulanan, tahunan)
- **Pelacakan Okupansi** — visualisasi tingkat okupansi dari waktu ke waktu
- **Dasbor Operasional** — daftar check-in/check-out hari ini, ringkasan status unit
- **Mode Periode Laporan** — batas `calendar_day` atau `hotel_day` yang dapat dikonfigurasi
- **Wawasan AI** — kartu ringkasan KPI otomatis (di-cache, tanpa function calling)
- **KRAI Chat** — asisten percakapan dengan 19+ alat function calling
- **Auto-refresh** — pembaruan data otomatis setiap 60 detik
- **Desain Responsif** — tata letak desktop + mobile
- **Lokalisasi Indonesia** — UI penuh bahasa Indonesia

## Tech Stack

- **Frontend**: Next.js 15 (App Router, Server Components)
- **Bahasa**: TypeScript
- **Styling**: TailwindCSS + shadcn/ui
- **Grafik**: Recharts
- **DB Cloud**: Supabase PostgreSQL (auth, transaksi, unit, pelanggan, fungsi RPC)
- **DB Analitik**: PostgreSQL 16 lokal (cache analitik, agregasi materialized)
- **Auth**: Supabase Auth + Row Level Security
- **Penyedia AI**: OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter, Grok, endpoint apa pun yang kompatibel dengan OpenAI

## Prasyarat

- **Node.js 18+** dengan npm
- **PostgreSQL 16** — DB analitik lokal di port 5433 (Docker atau instalasi native)
- **Proyek Supabase** — instance cloud untuk data primer
- **Docker** (opsional) — untuk menjalankan container sync-worker

## Pengaturan Awal

1. **Clone**
   ```bash
   git clone <repo-url>
   cd KR-Analytics-Dashboard
   ```

2. **Environment**
   ```bash
   cp .env.example .env.local
   ```
   Isi:
   - `NEXT_PUBLIC_SUPABASE_URL` — URL proyek Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — kunci anon/publik
   - `SUPABASE_SERVICE_ROLE_KEY` — kunci service role (server-only)

3. **DB Analitik Lokal**
   ```bash
   # Mulai PostgreSQL via Docker (port 5433)
   docker compose up -d postgres
   # Jalankan migrasi
   npm run db:migrate
   ```

4. **Install & jalankan**
   ```bash
   npm install
   npm run dev
   ```
   Aplikasi berjalan di `http://localhost:3031`

## Skrip yang Tersedia

| Skrip | Deskripsi |
|--------|-------------|
| `npm run dev` | Mulai dev server di port 3031 |
| `npm run build` | Build produksi |
| `npm run start` | Mulai production server di port 3031 |
| `npm run lint` | Pemeriksaan ESLint |
| `npm run type-check` | Pemeriksaan tipe TypeScript |
| `npm run test` | Rangkaian pengujian Jest |
| `npm run db:migrate` | Jalankan migrasi DB analitik |
| `npm run db:start` | Tunggu DB + jalankan migrasi + mulai aplikasi (entrypoint Docker) |
| `scripts/*.ts` | Skrip validasi dan pengujian |

## Arsitektur

### Dual Database

```
Supabase Cloud (PostgreSQL)          PostgreSQL Lokal (port 5433)
├── transactions                      ├── analytics_cache_mart
├── customers                         ├── analytics_query_cache
├── units (nomor_kamar)               ├── ai_insight_cache
├── locations (lokasi_apartemen)      ├── ai_provider_models
├── pengeluaran                       └── krai_chat_history
├── tagihan_bulanan
├── tagihan_fee_lunas
├── user_profiles / user_roles
├── app_settings
└── ~25 fungsi RPC
```

**Pola analytics-first**: Query dasbor mencoba cache DB analitik terlebih dahulu. Jika cache kosong atau tidak ada hasil, fallback ke panggilan RPC Supabase. Hasil kemudian mengisi cache untuk permintaan berikutnya.

### Mode Periode Laporan

Dapat dikonfigurasi melalui tabel `app_settings` (`key = 'report_period_mode'`).

| Mode | Rentang | Kasus Penggunaan |
|------|-------|----------|
| `calendar_day` (default) | 00:00–23:59 WIB | Hari kalender standar |
| `hotel_day` | 12:00 WIB hari ini – 11:59 WIB hari berikutnya | Menginap ala hotel |

Semua fungsi rentang tanggal di [`lib/services/date-range.ts`](lib/services/date-range.ts) dan [`lib/reporting-period.ts`](lib/reporting-period.ts) mengikuti mode yang dikonfigurasi.

### Sync Worker

Layanan berbasis Docker di [`sync-worker/`](sync-worker/) yang secara periodik menyinkronkan data dari Supabase ke DB analitik lokal. Berjalan sebagai container via `docker compose`.

## Struktur Proyek

```
KR-Analytics-Dashboard/
├── app/
│   ├── (dashboard)/           # Rute dasbor App Router
│   │   ├── analytics-ai/      # Halaman AI analitik
│   │   │   └── chat/          # AI Chat (tertanam)
│   │   ├── booking/           # Manajemen pemesanan
│   │   ├── chat/              # KRAI Chat (halaman penuh)
│   │   │   └── [id]/          # Chat per percakapan
│   │   ├── customer/          # Manajemen pelanggan
│   │   ├── dashboard/         # Dasbor utama
│   │   ├── kalender/          # Tampilan kalender
│   │   ├── keuangan/          # Laporan keuangan
│   │   ├── laporan/           # Laporan
│   │   ├── pengaturan/        # Pengaturan
│   │   └── unit/              # Manajemen unit
│   ├── api/                   # Rute API
│   │   ├── ai/                # Endpoint wawasan AI + chat
│   │   ├── app-settings/      # API pengaturan aplikasi
│   │   ├── krai/              # Riwayat KRAI
│   │   └── upload/            # Unggah berkas
│   ├── auth/                  # Aksi auth
│   ├── login/                 # Halaman login
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ai/                    # AI chat, wawasan, pemilih model
│   ├── booking/               # Filter pemesanan, tabel, statistik
│   ├── dashboard/             # Kartu KPI, grafik, panel
│   ├── laporan/               # Modal kategori pengeluaran
│   ├── layout/                # Sidebar, nav, UI mobile
│   ├── settings/              # Halaman pengaturan
│   ├── shared/                # MoneyValue, pemilih tanggal, filter, export
│   └── unit/                  # Grid unit, kartu lokasi
├── lib/
│   ├── ai/                    # Penyedia AI, alat, registry, riwayat, konfigurasi
│   │   └── tools/             # Implementasi alat individual
│   ├── analytics/             # Lapisan query DB analitik + cache
│   ├── dashboard/             # Layanan data dasbor (KPI, pendapatan, okupansi, dll.)
│   ├── services/              # Lapisan layanan (okupansi, pendapatan, pengeluaran, lokasi, rentang tanggal)
│   ├── supabase/              # Klien Supabase (server + browser)
│   ├── config/                # Konfigurasi navigasi
│   ├── contexts/              # Konteks React (AppSettings)
│   ├── utils/                 # Utilitas format
│   └── export/                # Export XLSX
├── types/                     # Definisi tipe TypeScript
│   ├── database.ts            # Tipe baris DB
│   ├── dashboard.ts           # Tipe domain dasbor
│   ├── analytics.ts           # Tipe analitik
│   ├── ai.ts                  # Tipe AI
│   ├── ai-models.ts           # Tipe penyedia model AI
│   └── index.ts               # Re-ekspor terpusat
├── supabase-schema/           # Migrasi SQL (RPC, tabel, trigger)
├── sync-worker/               # Docker sync worker
├── db/                        # Skrip DB analitik + migrasi
├── scripts/                   # Skrip validasi/pengujian
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Variabel Environment

Lihat [`.env.example`](.env.example) untuk referensi lengkap.

### Wajib

| Variabel | Deskripsi |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci anon/publik (aman untuk browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci service role (server-only) |
| `ANALYTICS_DATABASE_URL` | String koneksi DB analitik lokal |

### Opsional

| Variabel | Default | Deskripsi |
|----------|---------|-------------|
| `AI_PROVIDER` | — | Nama penyedia AI |
| `AI_API_KEY` | — | Kunci API penyedia AI |
| `AI_MODEL` | — | Model AI default |
| `AI_BASE_URL` | — | URL basis API kustom |
| `AI_ENCRYPTION_KEY` | — | Kunci untuk mengenkripsi kunci API yang disimpan |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL basis aplikasi |
| `DASHBOARD_PORT` | `3031` | Port aplikasi |
| `SYNC_WORKER_PORT` | `3032` | Port health check sync worker |
| `SYNC_INTERVAL_MS` | `300000` | Interval sinkronisasi |
| `SYNC_BATCH_SIZE` | `500` | Ukuran batch sinkronisasi |
| `SYNC_LOOKBACK_DAYS` | `365` | Lihat ke belakang sinkronisasi awal |

## Fungsi RPC (~27 total)

Semua berada di [`supabase-schema/`](supabase-schema/). Masing-masing adalah `SECURITY DEFINER`, diberikan ke role `authenticated`.

### KPI Dasbor

| Fungsi | Deskripsi |
|----------|-------------|
| `get_daily_revenue_trend` | Pendapatan harian, jumlah, rata-rata per transaksi |
| `get_profit_per_location` | Pendapatan per lokasi |
| `get_location_fullness` | Tingkat okupansi rata-rata/puncak per lokasi |
| `get_occupancy_per_unit` | Okupansi, pendapatan, transaksi per kamar |

### Pendapatan & Pemasaran

| Fungsi | Deskripsi |
|----------|-------------|
| `get_guest_source_summary` | Pendapatan berdasarkan sumber pemasaran |
| `get_repeat_guests` | Tamu dengan ≥2 kunjungan |
| `get_checkin_heatmap` | Distribusi jam check-in (24 jam) |
| `get_stay_duration_summary` | Kategori durasi menginap |

### Alat KRAI (AI function calling)

| Fungsi | Deskripsi |
|----------|-------------|
| `get_live_checkins` | Tamu yang sedang menginap secara real-time |
| `detect_idle_units` | Unit tanpa transaksi dalam X hari |
| `search_transactions` | Cari berdasarkan nama pelanggan, kamar, lokasi |
| `search_expenses` | Cari pengeluaran berdasarkan deskripsi, kategori |
| `get_unpaid_bills_detail` | Analisis detail umur tagihan belum dibayar |
| `get_underperforming_units` | Unit di bawah rata-rata okupansi/pendapatan |
| `estimate_month_end_revenue` | Proyeksi pendapatan akhir bulan |
| `get_weekend_vs_weekday_analysis` | Performa akhir pekan vs hari kerja |

### Admin & Keuangan

| Fungsi | Deskripsi |
|----------|-------------|
| `admin_create_user` | Buat pengguna (auth + profil + role) |
| `admin_delete_user` | Hapus pengguna (profil + role + auth) |
| `admin_update_user` | Perbarui profil/role pengguna |
| `pay_fee_items` | Bayar biaya pemasaran (atomik, dengan insert pengeluaran) |
| `pay_tagihan_bulanan` | Bayar tagihan bulanan (atomik, dengan insert pengeluaran) |
| `get_category_summary` | Ringkasan kategori pengeluaran |

### Utilitas

| Fungsi | Deskripsi |
|----------|-------------|
| `log_activity` | Catat entri log aktivitas |
| `get_user_display_name` | Pembantu mendapatkan nama tampilan pengguna |

### Trigger Notifikasi

| Fungsi | Deskripsi |
|----------|-------------|
| `handle_new_transaction_notification` | Trigger: notifikasi transaksi baru |
| `notify_new_request` | Trigger: notifikasi permintaan baru |
| `notify_request_response` | Trigger: notifikasi respons permintaan |
| `notify_new_checkin` | Trigger: notifikasi check-in baru |

## Skema Database

Lihat [`supabase-schema/`](supabase-schema/) untuk rangkaian migrasi SQL lengkap.

### Tabel Inti (Supabase Cloud)

| Tabel | Deskripsi |
|-------|-------------|
| `transactions` | Transaksi pemesanan (check-in/out, jumlah, pelanggan, kamar) |
| `customers` | Profil pelanggan |
| `units` / `nomor_kamar` | Unit kamar per lokasi |
| `locations` / `lokasi_apartemen` | Lokasi apartemen |
| `pengeluaran` | Pengeluaran |
| `tagihan_bulanan` | Tagihan bulanan |
| `tagihan_fee_lunas` | Pembayaran biaya pemasaran |
| `user_profiles` | Profil pengguna |
| `user_roles` | Penetapan role |
| `app_settings` | Pengaturan aplikasi (mode periode laporan, dll.) |

### Tabel Analitik (PostgreSQL Lokal / Database Analitik)

| Tabel | Deskripsi |
|-------|-------------|
| `analytics_cache_mart` | Cache materialized untuk query dasbor |
| `analytics_query_cache` | Cache hasil query |
| `ai_insight_cache` | Cache respons wawasan AI |
| `ai_provider_models` | Registry model penyedia AI |
| `krai_chat_history` | Riwayat percakapan KRAI |

## Tipe TypeScript

Definisi tipe yang dihasilkan di [`types/`](types/).

| Modul | Konten |
|--------|----------|
| [`types/database.ts`](types/database.ts) | Tipe baris untuk semua tabel DB (Transaction, Pengeluaran, TagihanBulanan, UserProfile, dll.) |
| [`types/dashboard.ts`](types/dashboard.ts) | Tipe domain dasbor (KPIData, RevenueDataPoint, OccupancyDataPoint, UnitPerformanceItem, dll.) |
| [`types/analytics.ts`](types/analytics.ts) | Tipe hasil analitik (DashboardKPIs, DailyRevenueTrend, MonthlyRevenueTrend, ProfitPerLocation, dll.) |
| [`types/ai.ts`](types/ai.ts) | Tipe AI (AIInsightRequest, ChatMessage, AIToolDefinition, AIToolCall, ParsedAIResponse) |
| [`types/ai-models.ts`](types/ai-models.ts) | Tipe model penyedia AI (ProviderModel, FetchModelsResponse) |
| [`types/index.ts`](types/index.ts) | Re-ekspor terpusat semua tipe |

Pola import:
```ts
import type { KPIData, RevenueDataPoint } from '@/types/dashboard';
import type { DashboardKPIs } from '@/types/analytics';
import type { Transaction } from '@/types/database';
import type { ChatMessage, AIToolDefinition } from '@/types/ai';
```

## Fitur AI

### Kartu Wawasan AI

Dasbor menampilkan kartu wawasan KPI yang dibuat otomatis. Ini adalah ringkasan yang di-cache yang dihitung dari DB analitik — tanpa function calling, tanpa streaming. Disegarkan secara periodik.

- Rute: `POST /api/ai/insight`
- Komponen: [`components/ai/AIInsightCard.tsx`](components/ai/AIInsightCard.tsx)

### KRAI Chat

Asisten AI percakapan dengan 19+ alat function calling. Mendukung respons yang diperkaya alat, pertanyaan lanjutan, dan riwayat percakapan.

- Rute: `POST /api/ai/chat`
- Komponen: [`components/ai/AIChatCore.tsx`](components/ai/AIChatCore.tsx), [`components/ai/AIChatFloat.tsx`](components/ai/AIChatFloat.tsx), [`components/ai/AIChatFullscreen.tsx`](components/ai/AIChatFullscreen.tsx)
- Halaman: [`app/(dashboard)/chat/`](app/(dashboard)/chat/), [`app/(dashboard)/analytics-ai/chat/`](app/(dashboard)/analytics-ai/chat/)

### Alat AI (19 alat, 4 panel komposit)

Lihat [`lib/ai/toolRegistry.ts`](lib/ai/toolRegistry.ts) untuk metadata lengkap.

**Panel Komposit** (mengembalikan beberapa metrik dalam satu panggilan):
- `get_dashboard_kpi_panel` — pendapatan, pengeluaran, laba, okupansi, perbandingan
- `get_marketing_panel` — sumber tamu, tamu berulang, akhir pekan/hari kerja
- `get_operations_panel` — okupansi per lokasi, heatmap check-in, performa karyawan
- `get_financial_panel` — laba per lokasi, YoY, tren pendapatan, metode pembayaran

**Real-time (tanpa parameter)**:
- `get_daily_summary` — perbandingan hari ini vs kemarin
- `get_latest_status` — check-in, check-out, tamu saat ini secara langsung
- `get_unit_inventory` — ketersediaan unit saat ini

**Analitik Inti**:
- `get_period_summary` — pendapatan, pengeluaran, transaksi untuk rentang tanggal
- `get_revenue_trend` — tren pendapatan harian dengan rata-rata/maks/min
- `compare_periods` — perbandingan periode berdampingan dengan delta

**Penemuan**:
- `search_transactions` — pencocokan pola fleksibel di seluruh transaksi
- `search_expenses` — cari pengeluaran berdasarkan deskripsi/kategori
- `get_guest_stay_history` — riwayat menginap tamu (pencarian ILIKE)
- `get_top_locations` — lokasi teratas berdasarkan pendapatan
- `get_top_customers` — pelanggan teratas berdasarkan kunjungan/pengeluaran

**Pemantauan**:
- `get_live_checkins` — check-in saat ini
- `detect_idle_units` — unit yang menganggur selama X hari
- `get_underperforming_units` — unit di bawah rata-rata
- `get_weekend_vs_weekday_analysis` — perbandingan performa
- `estimate_month_end_revenue` — proyeksi akhir bulan

**Penagihan**:
- `get_outstanding_bills` — ringkasan umur tagihan belum dibayar
- `get_unpaid_bills_detail` — detail umur tagihan belum dibayar

### Dukungan Penyedia AI

Dikonfigurasi melalui halaman pengaturan di `/pengaturan` (tab AI). Penyedia yang didukung:

- OpenAI (GPT-4, GPT-4o, GPT-4o-mini, o1, o3)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
- DeepSeek (DeepSeek V2, DeepSeek V3, DeepSeek R1)
- Google Gemini (Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash)
- Grok (xAI)
- OpenRouter (model apa pun)
- Endpoint apa pun yang kompatibel dengan OpenAI (URL basis kustom)

Konfigurasi AI disimpan terenkripsi di tabel [`app_settings`](supabase-schema/20260526_ai_config_global.sql). Daftar model dikelola via [`lib/ai/modelClient.ts`](lib/ai/modelClient.ts) dan [`lib/ai/models.ts`](lib/ai/models.ts).

## Keamanan

- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk server (Server Components, Server Actions, Rute API)
- Kunci anon Supabase menghormati Row Level Security (RLS)
- Semua fungsi RPC adalah `SECURITY DEFINER`, hanya diberikan ke `authenticated`
- Kunci API AI disimpan terenkripsi di `app_settings`
- `.env.local` ada di `.gitignore`

## Deployment

### Docker Compose (direkomendasikan)

```bash
docker compose up -d
```

Menjalankan 3 container:
- `kr-dashboard` — Aplikasi Next.js (port 3031)
- `kr-analytics-postgres` — DB analitik (port 5433)
- `kr-sync-worker` — Pekerja sinkronisasi data (port 3032 health check)

### Environment

Gunakan proyek Supabase berbeda untuk dev/staging/production. Setel `NEXT_PUBLIC_APP_URL` sesuai.

## Lisensi

MIT
