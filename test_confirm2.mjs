import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: trips } = await supabase.from('trips').select('id').eq('client_confirmed', false).limit(1);
    const tripId = trips[0].id;
    const url = `https://cytio.vercel.app/#/confirmacion/${tripId}`;
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });

    await page.type('input[placeholder="Ej. Juan Pérez (Recepción)"]', 'Test Name');
    const buttons = await page.$$('button');
    for(let btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if(text.includes('Confirmar Costo')) {
            await btn.click();
            break;
        }
    }
    
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({path: 'C:\\Users\\ALVARO\\.gemini\\antigravity\\brain\\62832576-4804-40ca-877e-dffea70a7378\\error_screen.png'});
    
    await browser.close();
}

run();
