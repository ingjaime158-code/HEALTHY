import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

dotenv.config();

(async () => {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    
    const { data } = await supabase.from('trips').select('id, client_confirmed, status').limit(1);
    const tripId = data?.[0]?.id || '12345';
    
    console.log("Testing trip:", tripId);
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    await page.goto(`http://localhost:5173/#/confirmacion/${tripId}`, { waitUntil: 'networkidle0' });
    
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Body text:", bodyText.substring(0, 500));
    
    await browser.close();
    process.exit(0);
})();
