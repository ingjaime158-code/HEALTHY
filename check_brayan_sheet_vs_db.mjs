import fs from 'fs';

async function run() {
    const sheetId = '1nmt78EBFBX8GwXjxJPRSrApDuWMLpz4edebvbTpmGk4';
    const gid = '1033946751';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&tcb=${Date.now()}`;
    
    console.log("Fetching BRAYAN's Vespertina Google Sheet...");
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error("HTTP error:", res.status);
            return;
        }
        const text = await res.text();
        console.log("Sheet rows fetched successfully. First 300 characters of CSV:");
        console.log(text.slice(0, 300));
        
        // Parse CSV lines
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        console.log(`Total rows in sheet: ${lines.length}`);
        
        console.log("\n=== ROWS IN BRAYAN'S VESPERTINA SHEET ===");
        lines.slice(0, 20).forEach((l, idx) => {
            console.log(`${idx}: ${l}`);
        });
    } catch (e) {
        console.error("Error fetching sheet:", e.message);
    }
}
run();
