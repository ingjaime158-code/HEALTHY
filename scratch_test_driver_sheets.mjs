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

async function checkUrl(name, type, url) {
  if (!url) {
    console.log(`Driver ${name} (${type}) has NO URL.`);
    return;
  }
  const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
  if (!sheetId) {
    console.log(`Driver ${name} (${type}) URL is invalid: ${url}`);
    return;
  }
  const gidMatch = url.match(/gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      console.log(`Driver ${name} (${type}) CSV export failed with HTTP ${res.status}`);
      return;
    }
    const text = await res.text();
    const firstLine = text.split('\n')[0];
    console.log(`Driver ${name} (${type}) sheet: OK. Headers: ${firstLine.trim()}`);
  } catch (err) {
    console.log(`Driver ${name} (${type}) failed with error: ${err.message}`);
  }
}

async function run() {
  const { data: dbDrivers } = await supabase.from('drivers').select('*');
  console.log(`Checking ${dbDrivers.length} drivers...`);
  for (const driver of dbDrivers) {
    await checkUrl(driver.name, 'Morning', driver.morning_sheet_url);
    await checkUrl(driver.name, 'Evening', driver.evening_sheet_url);
  }
}

run();
