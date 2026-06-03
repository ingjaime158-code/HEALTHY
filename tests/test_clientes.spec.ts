import { test } from '@playwright/test';

test('Capture client manager blank page error', async ({ page }) => {
    // Collect all console logs and exceptions
    const logs: string[] = [];
    const errors: any[] = [];

    page.on('console', msg => {
        const txt = `[${msg.type().toUpperCase()}] ${msg.text()}`;
        logs.push(txt);
        console.log(txt);
    });

    page.on('pageerror', err => {
        errors.push(err);
        console.error('[PAGE ERROR]', err.message);
        console.error(err.stack);
    });

    // 1. Go to root
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2. Mock auth in localStorage
    await page.evaluate(() => {
        localStorage.setItem('hd_current_user', 'jimmy@healthydreams.com');
        localStorage.setItem('hd_user_role', 'Administrador');
        localStorage.setItem('hd_user_name', 'JIMMY');
    });

    // 3. Go to /clientes
    console.log('Navigating to client manager page...');
    await page.goto('/#/clientes');
    
    // Wait for the main elements of ClientManager to render
    console.log('Waiting for elements to render...');
    await page.waitForSelector('text=Sincronizar con Excel', { timeout: 10000 });
    
    const pageText = await page.innerText('body');
    console.log('Page text snapshot (first 300 chars):', pageText.substring(0, 300));

    console.log('--- TEST RESULTS ---');
    console.log(`Logs captured: ${logs.length}`);
    console.log(`Page errors captured: ${errors.length}`);
    
    if (errors.length > 0) {
        console.log('ERRORS FOUND:');
        errors.forEach((err, i) => {
            console.log(`\nError #${i + 1}: ${err.message}`);
            console.log(err.stack);
        });
    } else {
        console.log('No page errors detected.');
    }
});
