import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function checkSheet(name, type, url) {
  if (!url) return;
  const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
  if (!sheetId) return;
  
  const editUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  try {
    const res = await fetch(editUrl);
    const html = await res.text();
    const regex = /\[\d+,0,\\"(\d+)\\",\[\{\\?\"1\\?\":\[\[0,0,\\?\"([^"\\]+)\\?\"/g;
    let match;
    const tabs = [];
    while ((match = regex.exec(html)) !== null) {
      tabs.push(`"${match[2]}" (GID: ${match[1]})`);
    }
    console.log(`Driver ${name} (${type}) tabs:`, tabs.join(', ') || 'No tabs found via regex.');
  } catch (err) {
    console.log(`Driver ${name} (${type}) failed:`, err.message);
  }
}

async function run() {
  const { data: dbDrivers } = await supabase.from('drivers').select('*');
  for (const driver of dbDrivers) {
    await checkSheet(driver.name, 'Morning', driver.morning_sheet_url);
    await checkSheet(driver.name, 'Evening', driver.evening_sheet_url);
  }
}

run();
