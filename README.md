# 📨 RCS Message Gateway

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node.js-20%20LTS-brightgreen?style=for-the-badge&logo=node.js)
![Playwright](https://img.shields.io/badge/playwright-1.x-2EAD33?style=for-the-badge&logo=playwright)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue?style=for-the-badge&logo=mysql)
![Express](https://img.shields.io/badge/express-5.x-lightgrey?style=for-the-badge&logo=express)
![License](https://img.shields.io/badge/license-Private-orange?style=for-the-badge)

**Gateway RCS Message (Rich Communication Services) berbasis Playwright untuk mengirim pesan kaya (teks, gambar, tombol interaktif) melalui platform RCS kepada pelanggan PT. Sahabat Sakinah.**

</div>

---

## 📋 Daftar Isi

- [Gambaran Umum](#-gambaran-umum)
- [Fitur](#-fitur)
- [Arsitektur](#-arsitektur)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [API Endpoints](#-api-endpoints)
- [Deployment (Bare Metal)](#-deployment-bare-metal)
- [Catatan RAM](#-catatan-ram)

---

## 🌐 Gambaran Umum

RCS Message Gateway memungkinkan pengiriman pesan RCS (penerus SMS modern) yang mendukung konten kaya seperti teks formatting, gambar, kartu, dan tombol interaktif. Menggunakan **Playwright** untuk mengotomasi browser session RCS.

Dalam infrastruktur cluster, dijalankan pada **5 Mini PC** (dapat ditambah sesuai kebutuhan) di belakang Nginx Load Balancer.

---

## ✨ Fitur

| Fitur | Deskripsi |
|-------|-----------|
| 📨 **RCS Messaging** | Kirim pesan RCS dengan konten kaya |
| 🖼️ **Media Support** | Gambar, kartu interaktif, tombol |
| 🔐 **Session Manager** | Kelola sesi browser Playwright |
| 🔐 **SSO Auth** | Terintegrasi dengan SSO internal (JWT) |
| 🔄 **Auto Reconnect** | Sesi browser otomatis di-restart jika crash |
| 📝 **Message Queue** | Antrian pengiriman pesan |
| 📊 **Delivery Status** | Tracking status pengiriman |
| ❤️ **Health Check** | Endpoint untuk load balancer |

---

## 🏗️ Arsitektur

```
Browser / FE App
      │
      ▼
 Nginx Load Balancer (192.168.56.250)
      │  path: /rcs/*
      ▼
 RCS Node (192.168.56.31-35:3000)
      │
      ├── Playwright ──► Chromium Browser (headless)
      │       └──────────► RCS Platform Web
      ├── Express ────► REST API
      ├── Session Manager ──► Browser Session Store
      └── MySQL ──────► Message Logs (10.9.9.110)
```

---

## ⚙️ Prasyarat

- **Node.js** v20 LTS
- **MySQL** 8.0 (remote di `10.9.9.110`)
- **Chromium** browser + dependencies Playwright
- **Xvfb** (virtual display untuk headless browser di server)
- OS: **Debian 13** (recommended)

> ⚠️ **Catatan RAM**: Playwright menjalankan Chromium headless yang membutuhkan ~400-600MB RAM. Pastikan tidak ada proses berat lain di PC yang sama.

---

## 📦 Instalasi

```bash
# Clone repository
git clone https://github.com/USERNAME/rcs-message.git
cd rcs-message

# Install dependencies
npm install

# Install Playwright browser
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers npx playwright install-deps chromium

# Salin dan edit konfigurasi
cp .env.example .env
nano .env

# Jalankan (pastikan Xvfb aktif)
DISPLAY=:99 node server.js
```

---

## 🔧 Konfigurasi

Buat file `.env`:

```env
# Server
PORT=3000
SERVER_ID=RCS-NODE-01         # ID unik per node
NODE_OPTIONS=--max-old-space-size=512

# Database
DB_HOST=10.9.9.110
DB_USER=userdb
DB_PASS=your-password
DB_NAME=rsc_massage

# Auth
JWT_SECRET=your-secret-key

# Playwright
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
```

---

## 📡 API Endpoints

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
```

### Messages

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/send` | Kirim pesan RCS |
| `GET` | `/api/messages` | Riwayat pesan |
| `GET` | `/api/messages/:id` | Detail pesan & status |

### Sessions

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/sessions` | Status sesi browser |
| `POST` | `/api/sessions/restart` | Restart sesi |

### System

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health check (untuk LB) |

---

## 🚀 Deployment (Bare Metal)

```bash
# Di Mini PC yang dialokasikan sebagai RCS Message
sudo bash /opt/cluster-setup/scripts/setup-base.sh
sudo bash /opt/cluster-setup/scripts/deploy-rcs.sh
sudo bash /opt/cluster-setup/scripts/deploy-agent.sh
```

Script akan otomatis:
- Install Chromium + semua dependencies Playwright
- Setup Xvfb (virtual display)
- Install Playwright browser di `/opt/playwright-browsers`
- Register ke PM2 dengan environment `DISPLAY=:99`

### PM2 Commands
```bash
pm2 status              # Cek status
pm2 logs rcs-message    # Lihat log realtime
pm2 restart rcs-message # Restart service
systemctl status xvfb   # Cek virtual display
```

---

## 💾 Catatan RAM

Service ini adalah yang paling berat di cluster karena menjalankan browser headless.

| Komponen | Estimasi RAM |
|----------|-------------|
| Node.js runtime | ~80MB |
| Playwright + Chromium | ~400-600MB |
| **Total per proses** | **~500-700MB** |

> 💡 **Rekomendasi**: Alokasikan lebih banyak Mini PC untuk RCS sesuai volume pesan. Mulai dari 5 PC, tambah sesuai kebutuhan (cluster dapat di-expand kapan saja via Dashboard).

---

<div align="center">

**PT. Sahabat Sakinah** · Backend Team · 2026

</div>
