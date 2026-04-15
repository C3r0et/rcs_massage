const { chromium } = require('playwright');
const axios = require('axios');
const path = require('path');

// --- KONFIGURASI ---
const BACKEND_URL = "http://localhost:3000/api";
const SESSION_PATH = path.resolve(__dirname, 'browser_session');
const POLL_INTERVAL = 3000; 
const HEADLESS = false;     

async function runBrowserGateway() {
    console.log("🚀 Menjalankan Browser RCS Gateway (Versi Stabil ID/EN)...");
    console.log(`📂 Menyimpan sesi di: ${SESSION_PATH}`);
    
    const context = await chromium.launchPersistentContext(SESSION_PATH, {
        headless: HEADLESS,
        viewport: null, 
        args: ['--start-maximized']
    });

    const page = await context.newPage();
    await page.goto('https://messages.google.com/web');

    console.log("----------------------------------------------------------------");
    console.log("📌 STATUS: MENUNGGU SCAN QR CODE / SINKRONISASI...");
    console.log("1. Jika muncul QR Code, CENTANG 'Remember this computer' lalu SCAN.");
    console.log("2. Tunggu sampai daftar pesan Anda muncul di layar.");
    console.log("----------------------------------------------------------------");

    const loginSuccessSelector = [
        'button[aria-label="Start chat"]', 
        'button[aria-label="Mulai chat"]', 
        'mw-conversation-list', 
        '.mbc-fab',
        'mw-main-nav'
    ].join(', ');

    try {
        await page.waitForSelector(loginSuccessSelector, { timeout: 180000 }); 
        console.log("✅ LOGIN BERHASIL TERDETEKSI.");
        await page.waitForTimeout(5000); 
    } catch (e) {
        console.log("⚠️  Halaman belum sepenuhnya siap, mencoba memproses...");
    }

    // --- LOOP UTAMA ---
    while (true) {
        try {
            // 1. Cek Antrean Pesan
            const msgResponse = await axios.get(`${BACKEND_URL}/rcs/pending`);
            if (msgResponse.data.success && msgResponse.data.data.length > 0) {
                console.log(`[.] Memproses ${msgResponse.data.data.length} antrean pesan.`);
                for (const msg of msgResponse.data.data) {
                    await processMessage(page, msg);
                    await page.waitForTimeout(3000);
                }
            }

            // 2. Cek Antrean Screening RCS
            const screenResponse = await axios.get(`${BACKEND_URL}/rcs/screen/pending`);
            if (screenResponse.data.success && screenResponse.data.data.length > 0) {
                console.log(`[screen] Memproses ${screenResponse.data.data.length} antrean screening.`);
                for (const item of screenResponse.data.data) {
                    await checkRCSCapability(page, item);
                    await page.waitForTimeout(2000);
                }
            }

            // Jika tidak ada apa-apa, tunggu
            if ((!msgResponse.data.data || msgResponse.data.data.length === 0) &&
                (!screenResponse.data.data || screenResponse.data.data.length === 0)) {
                await page.waitForTimeout(POLL_INTERVAL);
            }

        } catch (error) {
            console.error("❌ Masalah koneksi atau browser:", error.message);
            await page.waitForTimeout(POLL_INTERVAL);
        }
    }
}

async function processMessage(page, msg) {
    const { id, recipient, message_content } = msg;

    try {
        console.log(`[*] Memproses antrean ID ${id} ke ${recipient}...`);

        // A. Tutup banner/pop-up jika ada
        try {
            const closeBanner = await page.$('button[aria-label*="Tutup"], button[aria-label*="Close"]');
            if (closeBanner) await closeBanner.click();
        } catch (e) {}

        // 1. Klik Start Chat / Mulai Chat (Selector Baru yang lebih Akurat)
        // Ditemukan bahwa tombol ini adalah tag <a> dengan href tertentu
        const startChatBtn = 'a[href*="/web/conversations/new"], a.fab, button[aria-label*="chat"], .mbc-fab';
        await page.waitForSelector(startChatBtn, { timeout: 30000 });
        await page.click(startChatBtn);
        await page.waitForTimeout(3000);

        // 2. Ketik Nomor Tujuan
        const recipientSelector = 'input[placeholder*="nama"], input[placeholder*="name"], input[aria-label*="Search"], input.input';
        await page.waitForSelector(recipientSelector, { timeout: 20000 });
        await page.fill(recipientSelector, recipient);
        await page.waitForTimeout(2000);
        
        // Klik Tombol Saran "Kirim ke [nomor]" (Paling Stabil)
        const suggestionBtn = 'button.button, button:has-text("Kirim ke"), button:has-text("Send to")';
        console.log(`[.] Menunggu tombol saran muncul...`);
        await page.waitForSelector(suggestionBtn, { timeout: 15000 });
        await page.click(suggestionBtn);
        
        console.log(`[.] Membuka percakapan...`);
        await page.waitForTimeout(2000);

        // 3. KETIK PESAN
        // Elemen asli Google Messages bukan div, melainkan TEXTAREA
        // Selector utama: textarea.input atau mws-message-compose textarea
        const messageBox = 'textarea.input, mws-message-compose textarea, div[role="textbox"][contenteditable="true"]';
        
        console.log(`[.] Menunggu kotak pesan...`);
        await page.waitForSelector(messageBox, { state: 'visible', timeout: 20000 });
        await page.click(messageBox);
        await page.waitForTimeout(500);
        
        await page.keyboard.type(message_content);
        await page.waitForTimeout(1500);

        // 4. KIRIM - Klik langsung tanpa menunggu visibility (force:true)
        // Tombol sudah ditemukan di DOM dengan class 'send-button'
        const sendBtn = 'button.send-button';
        try {
            await page.click(sendBtn, { force: true });
        } catch (e) {
            // Fallback: tekan Enter jika klik tombol gagal
            console.log(`[.] Klik tombol gagal, mencoba tekan Enter...`);
            await page.keyboard.press('Enter');
        }
        
        console.log(`✅ Pesan ID ${id} TERKIRIM.`);

        // 5. Update Status ke Backend
        await axios.post(`${BACKEND_URL}/rcs/webhook`, {
            message_id: id,
            new_status: 'sent',
            provider_info: { gateway: 'google-messages-web-playwright' }
        });

        await page.waitForTimeout(2000);
        
    } catch (err) {
        console.error(`❌ Gagal mengirim pesan ID ${id}:`, err.message);
        
        // Upaya pemulihan: jika stuck, muat ulang halaman
        if (err.message.includes('Timeout')) {
            console.log("🔄 Timeout terdeteksi, mencoba merefresh halaman...");
            await page.reload();
            await page.waitForTimeout(5000);
        }

        try {
            await axios.post(`${BACKEND_URL}/rcs/webhook`, {
                message_id: id,
                new_status: 'failed',
                provider_info: { error: err.message }
            });
        } catch (backendErr) {
            console.error("Gagal update status gagal ke backend.");
        }
    }
}

async function checkRCSCapability(page, item) {
    const { phone_number } = item;
    let isRCS = false;

    try {
        console.log(`[screen] Mengecek RCS untuk: ${phone_number}...`);

        // Tutup banner/pop-up jika ada
        try {
            const closeBanner = await page.$('button[aria-label*="Tutup"], button[aria-label*="Close"]');
            if (closeBanner) await closeBanner.click();
        } catch (e) {}

        // Buka percakapan baru
        const startChatBtn = 'a[href*="/web/conversations/new"], a.fab, button[aria-label*="chat"], .mbc-fab';
        await page.waitForSelector(startChatBtn, { timeout: 20000 });
        await page.click(startChatBtn);
        await page.waitForTimeout(2000);

        // Ketik nomor
        const recipientSelector = 'input[placeholder*="nama"], input[placeholder*="name"], input[aria-label*="Search"], input.input';
        await page.waitForSelector(recipientSelector, { timeout: 15000 });
        await page.fill(recipientSelector, phone_number);
        await page.waitForTimeout(2000);

        // Klik saran "Kirim ke [nomor]"
        const suggestionBtn = 'button.button, button:has-text("Kirim ke"), button:has-text("Send to")';
        await page.waitForSelector(suggestionBtn, { timeout: 10000 });
        await page.click(suggestionBtn);
        await page.waitForTimeout(4000);

        // Cek: Apakah placeholder/aria-label textarea mengandung kata "RCS"?
        const textarea = await page.$('textarea.input, mws-message-compose textarea');
        if (textarea) {
            const placeholder = await textarea.getAttribute('placeholder') || '';
            const ariaLabel = await textarea.getAttribute('aria-label') || '';
            const sendBtn = await page.$('button[aria-label*="RCS"], button[aria-label*="end-to-end encrypted"]');

            if (
                placeholder.toUpperCase().includes('RCS') ||
                ariaLabel.toUpperCase().includes('RCS') ||
                sendBtn !== null
            ) {
                isRCS = true;
            }
        }

        console.log(`[screen] ${phone_number} → ${isRCS ? '✅ RCS AKTIF' : '❌ SMS Only'}`);

        // Kirim hasil ke backend
        await axios.post(`${BACKEND_URL}/rcs/screen/result`, {
            phone_number,
            is_rcs_capable: isRCS
        });

        // Kembali ke halaman utama
        await page.goBack();
        await page.waitForTimeout(2000);

    } catch (err) {
        console.error(`[screen] Gagal mengecek ${phone_number}:`, err.message);
        // Tandai sebagai failed agar tidak diulang terus
        try {
            await db.query(
                `UPDATE rcs_screening SET status = 'failed' WHERE phone_number = ?`,
                [phone_number]
            );
        } catch (e) {}
        // Jika stuck, reload
        try { await page.reload(); await page.waitForTimeout(4000); } catch(e) {}
    }
}

runBrowserGateway();
