import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: trips, error } = await supabase.from('trips').select('id, client_confirmed').eq('client_confirmed', false).limit(1);
    if (!trips || trips.length === 0) {
        console.log("No pending trips to test.");
        return;
    }
    const tripId = trips[0].id;
    const url = `http://localhost:5173/#/confirmacion/${tripId}`;
    console.log(`Testing URL: ${url}`);
    
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        viewport: { width: 375, height: 667, isMobile: true } // Emulate mobile
    });
    const page = await browser.newPage();
    
    // Log page errors (which cause white screens in React usually)
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto(url, { waitUntil: 'networkidle0' });

    try {
        await page.waitForSelector('input[placeholder="Ej. Juan Pérez (Recepción)"]', { timeout: 10000 });
        await page.type('input[placeholder="Ej. Juan Pérez (Recepción)"]', 'Test Name Mobile');
        
        console.log('Clicking confirm button...');
        const buttons = await page.$$('button');
        for(let btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if(text.includes('Confirmar Costo')) {
                await btn.click();
                break;
            }
        }
        
        // Wait a bit to see what happens
        await new Promise(r => setTimeout(r, 3000));
        
        // Take a screenshot to inspect
        await page.screenshot({path: 'C:\\Users\\ALVARO\\.gemini\\antigravity\\brain\\62832576-4804-40ca-877e-dffea70a7378\\error_screen2.png'});
        console.log("Screenshot taken.");
    } catch (e) {
        console.log('Script Error:', e.toString());
    }
    
    await browser.close();
}

run();
