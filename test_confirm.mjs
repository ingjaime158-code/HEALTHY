import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // 1. Get a trip
    const { data: trips, error } = await supabase.from('trips').select('id, client_confirmed').eq('client_confirmed', false).limit(1);
    if (error || !trips || trips.length === 0) {
        console.error('No trips to test with or error:', error);
        return;
    }
    const tripId = trips[0].id;
    console.log(`Testing with trip ID: ${tripId}`);

    const url = `https://cytio.vercel.app/#/confirmacion/${tripId}`;
    console.log(`Navigating to ${url}`);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    await page.goto(url, { waitUntil: 'networkidle0' });

    try {
        await page.waitForSelector('input[placeholder="Ej. Juan Pérez (Recepción)"]');
        await page.type('input[placeholder="Ej. Juan Pérez (Recepción)"]', 'Test Name');
        
        console.log('Clicking confirm button...');
        // Find button that contains Confirmar Costo
        const buttons = await page.$$('button');
        let clicked = false;
        for(let btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if(text.includes('Confirmar Costo')) {
                await btn.click();
                clicked = true;
                break;
            }
        }
        
        await new Promise(r => setTimeout(r, 2000));
        console.log('Finished waiting.');
    } catch(e) {
        console.error('Test script error:', e.toString());
    }

    await browser.close();
}

run();
