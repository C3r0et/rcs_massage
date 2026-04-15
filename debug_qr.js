/**
 * Script debug: Cek apakah browser bisa navigasi ke halaman QR Google Messages
 * Jalankan: node debug_qr.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function debugQR() {
    console.log('🔍 Membuka browser untuk debug QR...');
    
    const testPath = path.resolve(__dirname, 'sessions', 'debug_test');
    
    const context = await chromium.launchPersistentContext(testPath, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await context.newPage();
    
    // Step 1: Buka halaman utama
    console.log('1. Navigasi ke messages.google.com/web...');
    await page.goto('https://messages.google.com/web', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Screenshot step 1
    await page.screenshot({ path: 'debug_step1_welcome.png', fullPage: false });
    console.log('   Screenshot disimpan: debug_step1_welcome.png');
    console.log('   URL saat ini:', page.url());
    console.log('   Title:', await page.title());
    
    // Step 2: Cek elemen yang ada
    const allText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('   Teks halaman:', allText);
    
    // Step 3: Cari tombol Pair
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a, button')).map(el => ({
            tag: el.tagName,
            text: el.innerText?.trim(),
            href: el.href,
            ariaLabel: el.getAttribute('aria-label')
        })).filter(el => el.text || el.ariaLabel);
    });
    console.log('\n2. Semua tombol/link yang ditemukan:');
    links.forEach(l => console.log(`   [${l.tag}] text="${l.text}" href="${l.href}" aria="${l.ariaLabel}"`));

    // Step 4: Coba klik pair
    try {
        await page.locator('text=Pair with QR code').click({ timeout: 5000 });
        console.log('\n3. ✅ Berhasil klik "Pair with QR code"!');
        await page.waitForTimeout(4000);
    } catch (e) {
        console.log('\n3. ❌ Gagal klik teks Inggris, coba Bahasa Indonesia...');
        try {
            await page.locator('text=Sambungkan dengan kode QR').click({ timeout: 5000 });
            console.log('   ✅ Berhasil klik "Sambungkan dengan kode QR"!');
            await page.waitForTimeout(4000);
        } catch (e2) {
            console.log('   ❌ Gagal juga:', e2.message);
        }
    }
    
    // Step 4: Tunggu + cek toggle Remember
    console.log('\n4. Mencek toggle "Remember this computer"...');
    await page.waitForTimeout(3000);
    
    const toggleSelectors = [
        'text=Remember this computer',
        '[aria-label*="Remember"]',
        'mat-slide-toggle',
        '.remember-this-computer',
        '[data-e2e-remember-this-computer]'
    ];
    
    for (const sel of toggleSelectors) {
        try {
            const count = await page.locator(sel).count();
            if (count > 0) {
                console.log(`   ✅ Toggle ditemukan dengan selector: "${sel}"`);
                await page.locator(sel).first().click();
                console.log('   ✅ Toggle diklik!');
                await page.waitForTimeout(1000);
                break;
            }
        } catch (e) {
            console.log(`   ❌ "${sel}" tidak ditemukan`);
        }
    }

    // Step 5: Screenshot setelah klik
    await page.screenshot({ path: 'debug_step2_after_click.png', fullPage: false });
    console.log('\n5. Screenshot setelah klik: debug_step2_after_click.png');
    console.log('   URL setelah klik:', page.url());
    
    // Step 6: Cari elemen QR
    const qrSelectors = ['mw-qr-code', 'mw-qr-code-view', 'canvas', 'img', '.qr-code-container'];
    console.log('\n6. Elemen QR yang ditemukan:');
    for (const sel of qrSelectors) {
        const count = await page.locator(sel).count();
        if (count > 0) console.log(`   ✅ "${sel}" ditemukan (${count} elemen)`);
    }
    
    await context.close();
    console.log('\n✅ Debug selesai!');
}

debugQR().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
