const { chromium } = require('playwright');
(async () => {
    const context = await chromium.launchPersistentContext('test1234', {
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
    await page.goto('https://messages.google.com/web', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a, button, div[role="button"]')).map(el => ({
            tag: el.tagName,
            text: el.innerText?.trim(),
            href: el.href,
            ariaLabel: el.getAttribute('aria-label')
        })).filter(el => el.text || el.ariaLabel);
    });
    console.log(JSON.stringify(links, null, 2));

    const html = await page.content();
    require('fs').writeFileSync('debug_html.html', html);

    await context.close();
})();
