# DManga - Manga Downloader & JPG Converter 📖✨

Aplikasi berbasis web modern untuk mengunduh chapter manga dari berbagai platform dan secara otomatis mengonversi seluruh gambar (WEBP / PNG / GIF / JPG) menjadi file **`.jpg`** berkualitas tinggi dalam arsip **ZIP** atau folder lokal.

---

## 🚀 Fitur Utama

- **MangaDex.org Support**:
  - Mengambil seluruh halaman chapter secara otomatis melalui API resmi MangaDex.
  - Pilihan kualitas gambar (Original / Data Saver).
- **nhentai.net Support**:
  - Bypass Cloudflare Bot Challenge menggunakan headless browser scraper (`puppeteer-core`).
  - DNS over HTTPS (DoH) & custom SNI routing untuk mengatasi pemblokiran ISP lokal.
  - Mendukung ekstraksi hingga ratusan halaman (misal 160+ halaman) tanpa error.
- **MangaFire.to Support**:
  - Menggunakan browser automation untuk membaca reader terenkripsi & dynamic lazy-loaded images.
  - Smart Auto-Scroll & keyboard page-turning simulator (`ArrowRight` / `PageDown` / `Space`) untuk mendukung **Paged Reader Mode** dan **Continuous Reading**.
- **Real-Time Progress Tracking**:
  - Progress bar *live* dan akurat: memantau proses unduh dan konversi per halaman (misal `Halaman 45/160 (28%)`).
- **Opsi Ekspor**:
  - **Download ZIP (.jpg)**: Mengompres seluruh gambar ke dalam satu file `.zip` terstruktur dan langsung diunduh ke browser.
  - **Simpan ke Folder Lokal**: Menyimpan langsung file-file `.jpg` ke folder komputer Anda.

---

## 🛠️ Persyaratan Sistem

- **Node.js** (v18 atau lebih baru)
- **Google Chrome** atau **Opera** terpasang di sistem Windows (digunakan otomatis oleh Puppeteer)

---

## 📦 Instalasi & Cara Menjalankan

1. **Clone repository ini**:
   ```bash
   git clone https://github.com/SetiawanFadzli/dmanga.git
   cd dmanga
   ```

2. **Install dependensi**:
   ```bash
   npm install
   ```

3. **Jalankan aplikasi**:
   ```bash
   npm start
   ```

4. **Buka di browser**:
   Akses **[http://localhost:3000](http://localhost:3000)**

---

## 📝 Contoh Link yang Didukung

- **MangaDex**: `https://mangadex.org/chapter/99711c0a-a689-485f-877e-f1efb397b77e/1`
- **nhentai**: `https://nhentai.net/g/604761/` atau `https://nhentai.net/g/120891/`
- **MangaFire**: `https://mangafire.to/title/703y6-perfect-life-system-double-cash-for-her-favor/chapter/9345287` atau `https://mangafire.to/title/4qzzo-ingoshimaa/chapter/2529003`

---

## 📜 Lisensi
MIT License
