const { chromium } = require('playwright');
const path = require('path');
const db = require('./config/db');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> { context, page, qrInterval, status }
    }

    // =========================================================
    //  INISIALISASI ULANG SESI DARI DATABASE
    // =========================================================
    async initialize() {
        console.log('🔄 SessionManager: Memulihkan sesi dari database...');
        try {
            const [rows] = await db.query(
                "SELECT * FROM rcs_sessions WHERE status IN ('active', 'pending_qr')"
            );
            for (const session of rows) {
                console.log(`  ↳ Memulihkan sesi [${session.label}] - status: ${session.status}`);
                await this.launchBrowser(session.id, session.session_path, session.status);
                await new Promise(r => setTimeout(r, 2000)); // Jeda antar sesi
            }
            console.log(`✅ ${rows.length} sesi berhasil dipulihkan.`);
        } catch (err) {
            console.error('❌ Gagal memulihkan sesi:', err.message);
        }
    }

    // =========================================================
    //  BUAT SESI BARU
    // =========================================================
    async createSession(sessionId, employeeId, label, sessionPath) {
        // Simpan ke DB
        await db.query(
            "INSERT INTO rcs_sessions (id, employee_id, label, status, session_path) VALUES (?, ?, ?, 'pending_qr', ?)",
            [sessionId, employeeId, label, sessionPath]
        );

        // Jalankan browser headless untuk sesi ini
        await this.launchBrowser(sessionId, sessionPath, 'pending_qr');

        return sessionId;
    }

    // =========================================================
    //  JALANKAN BROWSER UNTUK SATU SESI
    // =========================================================
    async launchBrowser(sessionId, sessionPath, initialStatus) {
        try {
            const context = await chromium.launchPersistentContext(sessionPath, {
                headless: true,
                viewport: { width: 1280, height: 800 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--mute-audio',
                    '--no-first-run'
                ]
            });

            const page = await context.newPage();
            
            // OPTIMASI MEMORI: Cegah Chrome memuat CSS, Font, dan Video!
            await page.route('**/*', route => {
                const type = route.request().resourceType();
                if (['stylesheet', 'font', 'media'].includes(type)) {
                    route.abort(); // Jangan habiskan RAM untuk mempercantik UI
                } else {
                    route.continue();
                }
            });

            page.on('crash', () => console.log(`[💥 CRASH] Halaman Playwright Crash pada sesi ${sessionId.slice(0,8)}!`));
            
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto('https://messages.google.com/web', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            // Cek apakah ada halaman welcome (belum login)
            // Coba lihat apakah ada teks "Pair" atau "Sambungkan"
            const pairLocator = page.locator('text="Pair with QR code", text="Sambungkan dengan kode QR", text="Gunakan kode QR"').first();
            const pairCount = await pairLocator.count().catch(() => 0);

            const isWelcomePage = await page.locator('text="Sign In", text="Login", text="Masuk"').count().catch(() => 0);

            if (pairCount > 0) {
                console.log(`[Session ${sessionId.slice(0,8)}] Mengklik 'Pair with QR code'...`);
                await pairLocator.click({ force: true }).catch(() => {});
                await page.waitForTimeout(4000);
            } else if (isWelcomePage > 0) {
                // Coba klik link pair via href langsung
                const pairLink = await page.$('a[href*="pair"], a[href*="qr"]');
                if (pairLink) {
                    await pairLink.click();
                    await page.waitForTimeout(4000);
                } else {
                    await page.goto('https://messages.google.com/web/authentication', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                    await page.waitForTimeout(3000);
                }
            } else {
                // Jika tidak ada di atas, mungkin sudah langsung di halaman QR
                // Navigasi ke authentication untuk memastikan
                await page.goto('https://messages.google.com/web/authentication', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(3000);
            }

            // ✅ Centang "Remember this computer" secara otomatis
            try {
                await page.waitForTimeout(1000);
                
                // Cari toggle secara spesifik melalui Playwright locator (teks bahasa Inggris atau Indonesia)
                const toggleLocators = [
                    'text="Remember this computer"',
                    'text="Ingat komputer ini"',
                    '[aria-label*="Remember"]',
                    'mat-slide-toggle',
                    '.remember-this-computer'
                ];

                let toggled = false;
                for (const selector of toggleLocators) {
                    const toggleElement = await page.$(selector).catch(() => null);
                    if (toggleElement) {
                        // Jika teks, kita cari switch-nya di sekitarnya
                        const toggleSwitch = await toggleElement.evaluateHandle(el => {
                            const switchEl = el.closest('mat-slide-toggle, mat-checkbox, [role="switch"], [role="checkbox"]');
                            return switchEl || el;
                        });
                        await toggleSwitch.click({ force: true }).catch(() => {});
                        toggled = true;
                        break; // berhenti mencari jika sudah ketemu dan diklik
                    }
                }

                if (toggled) {
                    console.log(`[Session ${sessionId.slice(0,8)}] ✅ "Remember this computer" dicentang.`);
                } else {
                    console.log(`[Session ${sessionId.slice(0,8)}] ⚠️ Toggle "Remember" tidak ditemukan, mencoba klik koordinat estimasi...`);
                    // Fallback blind click di sekitar teks
                    const rememberText = await page.$('text="Remember this computer"').catch(() => null);
                    if (rememberText) {
                        await rememberText.click().catch(() => {});
                    }
                }
                await page.waitForTimeout(500);
            } catch (e) {
                console.log(`[Session ${sessionId.slice(0,8)}] ⚠️ Gagal klik remember toggle: ${e.message}`);
            }

            const sessionData = { context, page, status: initialStatus, qrInterval: null };
            this.sessions.set(sessionId, sessionData);

            if (initialStatus === 'pending_qr') {
                this._startQRPolling(sessionId, page);
            } else {
                // Verifikasi sesi masih valid, lalu mulai polling pesan
                const isStillLoggedIn = await page.$('a[href*="/web/conversations/new"], mw-conversation-list, .mbc-fab')
                    .catch(() => null);
                if (isStillLoggedIn) {
                    this._startMessagePolling(sessionId, page);
                } else {
                    // Sesi expired, kembali ke QR mode
                    console.log(`⚠️  Sesi ${sessionId.slice(0,8)} expired, menampilkan QR ulang...`);
                    await db.query("UPDATE rcs_sessions SET status = 'pending_qr' WHERE id = ?", [sessionId]);
                    this.sessions.get(sessionId).status = 'pending_qr';
                    this._startQRPolling(sessionId, page);
                }
            }
        } catch (err) {
            console.error(`❌ Gagal menjalankan browser sesi ${sessionId}:`, err.message);
            // Simpan detail error ke database agar bisa di-debug dari dashboard/API
            await db.query("UPDATE rcs_sessions SET status = 'error', error_info = ? WHERE id = ?", [err.message, sessionId]).catch(() => {});
        }
    }

    // =========================================================
    //  POLLING QR CODE (berjalan selama status = pending_qr)
    // =========================================================
    _startQRPolling(sessionId, page) {
        const sessionData = this.sessions.get(sessionId);
        console.log(`[QR] Memulai polling QR untuk sesi ${sessionId}`);

        const interval = setInterval(async () => {
            try {
                if (!this.sessions.has(sessionId)) {
                    clearInterval(interval);
                    return;
                }

                // Cek apakah sudah login (conversation list muncul)
                const isLoggedIn = await page.$('a[href*="/web/conversations/new"], mw-conversation-list, .mbc-fab');
                if (isLoggedIn) {
                    console.log(`✅ Sesi ${sessionId} AKTIF. QR berhasil discan!`);
                    clearInterval(interval);
                    await this._onSessionActive(sessionId, page);
                    return;
                }

                // Screenshot QR code element - koordinat dikonfirmasi dari debug
                const qrSelectors = [
                    '[data-e2e-qr-code] img',
                    'mw-qr-code img',
                    'mw-qr-code-view img',
                    'mw-qr-code canvas',
                    'mw-qr-code-view canvas',
                    'canvas',
                    '.qr-code-container img'
                ];

                let screenshotBuffer = null;

                // Ekstrak screenshot lewat Playwright Native Element Screenshot (sangat aman)
                for (const sel of qrSelectors) {
                    try {
                        const el = await page.$(sel);
                        if (el) {
                            // Paksa background putih agar kontras di dark mode (misal di Postman)
                            await el.evaluate(e => e.style.backgroundColor = 'white').catch(()=>null);
                            // Tunggu render selesai baru di-screenshot
                            screenshotBuffer = await el.screenshot({ type: 'png', timeout: 5000 });
                            if (screenshotBuffer) break;
                        }
                    } catch (e) {}
                }

                // Fallback: crop area QR yang sudah dikonfirmasi via debug (kanan atas)
                if (!screenshotBuffer) {
                    console.log(`[QR] Menggunakan fallback page screenshot untuk sesi ${sessionId}`);
                    screenshotBuffer = await page.screenshot({
                        type: 'png',
                        clip: { x: 700, y: 130, width: 380, height: 400 }
                    }).catch(e => {
                        console.log(`[QR] Error fallback screenshot:`, e.message);
                        return null;
                    });
                }

                if (screenshotBuffer) {
                    const base64 = screenshotBuffer.toString('base64');
                    // console.log(`[QR] Berhasil ekstrak gambar (${base64.length} bytes), menyimpan ke DB...`);
                    await db.query(
                        "UPDATE rcs_sessions SET qr_image = ?, qr_updated_at = NOW() WHERE id = ?",
                        [base64, sessionId]
                    );
                } else {
                    console.log(`[QR] ⚠️ Gagal mengekstrak QR code dari halaman.`);
                }
            } catch (e) {
                console.log(`[QR] Error saat polling QR:`, e.message);
            }
        }, 3000);

        sessionData.qrInterval = interval;
    }

    // =========================================================
    //  SESSION AKTIF SETELAH QR DISCAN
    // =========================================================
    async _onSessionActive(sessionId, page) {
        await db.query(
            "UPDATE rcs_sessions SET status = 'active', last_active = NOW(), qr_image = NULL, qr_updated_at = NULL WHERE id = ?",
            [sessionId]
        );
        const sessionData = this.sessions.get(sessionId);
        if (sessionData) sessionData.status = 'active';

        // Tunggu halaman stabil
        await page.waitForTimeout(3000);
        this._startMessagePolling(sessionId, page);
    }

    // =========================================================
    //  POLLING PESAN & SCREENING (berjalan selama status = active)
    // =========================================================
    _startMessagePolling(sessionId, page) {
        console.log(`[Poll] Memulai polling pesan untuk sesi ${sessionId}`);
        const loop = async () => {
            let inactivityCounter = 0;
            
            while (this.sessions.has(sessionId)) {
                try {
                    // Pengecekan Kesehatan Sesi (Apakah diputus dari HP?)
                    inactivityCounter++;
                    if (inactivityCounter % 3 === 0) { // Cek tiap ~9 detik saat tidak ada pesan
                        // Cara logis teraman: Jika deretan chat atau tombol "Mulai Chat" lenyap, berarti kita terlempar ke layar Unpaired/QR
                        const isStillLoggedIn = await page.$('a[href*="/web/conversations/new"], mw-conversation-list, .mbc-fab').catch(() => null);
                        
                        if (!isStillLoggedIn) {
                            console.log(`[Session ${sessionId.slice(0,8)}] 🚫 Antarmuka Chat hilang! Mengasumsikan koneksi putus secara remote...`);
                            
                            // Ubah status DB dan State kembali ke pending_qr
                            await db.query("UPDATE rcs_sessions SET status = 'pending_qr', qr_image = NULL WHERE id = ?", [sessionId]);
                            const sessionData = this.sessions.get(sessionId);
                            if (sessionData) sessionData.status = 'pending_qr';
                            
                            // Segarkan halaman agar bersih jika ada "Unpaired Modal" mengambang
                            await page.goto('https://messages.google.com/web/authentication', { waitUntil: 'domcontentloaded' }).catch(()=>{});
                            
                            // Jalankan kembali mode Polling QR
                            this._startQRPolling(sessionId, page);
                            break; // Hentikan loop pesan ini
                        }
                    }

                    // Ambil pesan pending milik sesi ini
                    const [messages] = await db.query(
                        "SELECT * FROM rcs_messages WHERE status = 'pending' AND (session_id = ? OR session_id IS NULL) ORDER BY created_at ASC LIMIT 5",
                        [sessionId]
                    );
                    for (const msg of messages) {
                        await this._processMessage(page, msg, sessionId);
                        await page.waitForTimeout(3000);
                    }

                    // Ambil antrean screening (dibagi rata ke semua sesi aktif)
                    const [screenItems] = await db.query(
                        "SELECT * FROM rcs_screening WHERE status = 'pending' LIMIT 3"
                    );
                    for (const item of screenItems) {
                        await this._checkRCSCapability(page, item);
                        await page.waitForTimeout(2000);
                    }

                    if (messages.length === 0 && screenItems.length === 0) {
                        await new Promise(r => setTimeout(r, 3000));
                    }
                } catch (err) {
                    console.error(`[Poll Error] Sesi ${sessionId}:`, err.message);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        };
        loop();
    }

    // =========================================================
    //  KIRIM PESAN VIA BROWSER
    // =========================================================
    async _processMessage(page, msg, sessionId) {
        const { id, recipient, message_content } = msg;
        try {
            console.log(`[${sessionId.slice(0, 8)}] Mengirim ke ${recipient}...`);

            // Tutup pop-up jika ada dengan tombol ESC
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            // 1. Klik Mulai Chat
            const startBtn = 'a[href*="/web/conversations/new"], a.fab, .mbc-fab';
            await page.waitForSelector(startBtn, { timeout: 20000 });
            await page.click(startBtn, { force: true });
            await page.waitForTimeout(2000);

            // 2. Ketik nomor
            const inputSel = 'input[placeholder*="nama"], input[placeholder*="name"], input.input';
            await page.waitForSelector(inputSel, { timeout: 15000 });
            await page.fill(inputSel, recipient);
            await page.waitForTimeout(2000);

            // 3. Klik saran "Kirim ke"
            const suggBtn = 'button.button, button:has-text("Kirim ke"), button:has-text("Send to")';
            await page.waitForSelector(suggBtn, { timeout: 10000 });
            await page.click(suggBtn);
            await page.waitForTimeout(4000);

            // 4. Ketik pesan di textarea
            const textSel = 'textarea.input, mws-message-compose textarea';
            await page.waitForSelector(textSel, { state: 'visible', timeout: 20000 });
            await page.click(textSel);
            await page.waitForTimeout(500);
            await page.keyboard.type(message_content);
            await page.waitForTimeout(1500);

            // 5. Tekan Enter & Klik kirim (Terkadang Enter lebih aman, kita lakukan keduanya untuk memastikan)
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            
            // Fallback klik tombol jika Enter belum terkirim
            try {
                const sendSelectors = 'button[data-e2e-send-text-button], button.send-button, button[aria-label*="Send"]';
                await page.locator(sendSelectors).first().click({ force: true, timeout: 3000 });
            } catch (e) {}

            console.log(`✅ [${sessionId.slice(0, 8)}] Pesan ID ${id} TERKIRIM.`);

            await db.query(
                "UPDATE rcs_messages SET status = 'sent', session_id = ? WHERE id = ?",
                [sessionId, id]
            );
            await page.waitForTimeout(2000);

        } catch (err) {
            console.error(`❌ [${sessionId.slice(0, 8)}] Gagal kirim pesan ID ${id}:`, err.message);
            await db.query("UPDATE rcs_messages SET status = 'failed' WHERE id = ?", [id]);
            try { await page.reload(); await page.waitForTimeout(4000); } catch (e) {}
        }
    }

    // =========================================================
    //  CEK KAPABILITAS RCS
    // =========================================================
    async _checkRCSCapability(page, item) {
        const { phone_number } = item;
        let isRCS = false;
        try {
            console.log(`[Screen] Mengecek RCS: ${phone_number}`);

            // Tandai sedang diproses agar sesi lain tidak mengambil item yang sama
            await db.query("UPDATE rcs_screening SET status = 'done' WHERE phone_number = ? AND status = 'pending'", [phone_number]);

            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            const startBtn = 'a[href*="/web/conversations/new"], a.fab, .mbc-fab';
            await page.waitForSelector(startBtn, { timeout: 20000 });
            await page.click(startBtn, { force: true });
            await page.waitForTimeout(2000);

            const inputSel = 'input[placeholder*="nama"], input[placeholder*="name"], input.input';
            await page.waitForSelector(inputSel, { timeout: 15000 });
            await page.fill(inputSel, phone_number);
            await page.waitForTimeout(2000);

            const suggBtn = 'button.button, button:has-text("Kirim ke"), button:has-text("Send to")';
            await page.waitForSelector(suggBtn, { timeout: 10000 });
            await page.click(suggBtn);
            await page.waitForTimeout(4000);

            const textarea = await page.$('textarea.input, mws-message-compose textarea');
            if (textarea) {
                const placeholder = await textarea.getAttribute('placeholder') || '';
                const sendBtn = await page.$('button[aria-label*="RCS"], button[aria-label*="end-to-end encrypted"], button[aria-label*="enkripsi"]');
                isRCS = placeholder.toUpperCase().includes('RCS') || sendBtn !== null;
            }

            console.log(`[Screen] ${phone_number} → ${isRCS ? '✅ RCS AKTIF' : '❌ SMS Only'}`);
            await db.query(
                "UPDATE rcs_screening SET is_rcs_capable = ?, checked_at = NOW() WHERE phone_number = ?",
                [isRCS ? 1 : 0, phone_number]
            );

            await page.goBack();
            await page.waitForTimeout(2000);
        } catch (err) {
            console.error(`[Screen] Gagal cek ${phone_number}:`, err.message);
            await db.query("UPDATE rcs_screening SET status = 'failed' WHERE phone_number = ?", [phone_number]);
            try { await page.reload(); await page.waitForTimeout(4000); } catch (e) {}
        }
    }

    // =========================================================
    //  AMBIL STATUS SESI
    // =========================================================
    getSessionStatus(sessionId) {
        const data = this.sessions.get(sessionId);
        return data ? data.status : null;
    }

    // =========================================================
    //  HENTIKAN SESI (TETAP ADA DI DATABASE SEBAGAI LOG)
    // =========================================================
    async terminateSession(sessionId) {
        const data = this.sessions.get(sessionId);
        if (data) {
            if (data.qrInterval) clearInterval(data.qrInterval);
            try { await data.context.close(); } catch (e) {}
            this.sessions.delete(sessionId);
        }
        await db.query("UPDATE rcs_sessions SET status = 'disconnected' WHERE id = ?", [sessionId]);
        console.log(`[Session] Sesi ${sessionId} diputus / disconnected.`);
    }

    // =========================================================
    //  HAPUS PERMANEN DARI DATABASE
    // =========================================================
    async destroySession(sessionId) {
        const data = this.sessions.get(sessionId);
        if (data) {
            if (data.qrInterval) clearInterval(data.qrInterval);
            try { await data.context.close(); } catch (e) {}
            this.sessions.delete(sessionId);
        }
        await db.query("DELETE FROM rcs_sessions WHERE id = ?", [sessionId]);
        console.log(`[Session] Sesi ${sessionId} dihapus permanen dari DB.`);
    }
}

module.exports = new SessionManager();
