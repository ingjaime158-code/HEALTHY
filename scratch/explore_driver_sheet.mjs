import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load from .env
const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

function parseCsvContent(text) {
  const result = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      result.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    result.push(currentRow);
  }

  return result.filter(row => row.some(field => field.length > 0));
}

function extractSheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractGid(url) {
  if (!url) return '0';
  const match = url.match(/gid=(\d+)/);
  return match ? match[1] : '0';
}

async function run() {
  try {
    const { data: dbDrivers, error } = await supabase.from('drivers').select('*');
    if (error) throw error;

    console.log("Registered Drivers in DB:", dbDrivers.map(d => ({ name: d.name, morning: !!d.morning_sheet_url, evening: !!d.evening_sheet_url })));

    // Busquemos a BRAYAN
    const brayan = dbDrivers.find(d => d.name.toUpperCase().includes('BRAYAN'));
    if (!brayan) {
      console.log("No BRAYAN found");
      return;
    }

    const url = brayan.morning_sheet_url;
    if (!url) {
      console.log("BRAYAN morning sheet url not set");
      return;
    }

    console.log("BRAYAN Morning URL:", url);
    const id = extractSheetId(url);
    const gid = extractGid(url);
    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    console.log("Exporting Brayan morning sheet as CSV:", csvUrl);

    const res = await fetch(csvUrl);
    if (!res.ok) {
      console.log("Failed to fetch Brayan sheet:", res.status);
      return;
    }

    const text = await res.text();
    const rows = parseCsvContent(text);
    console.log("Rows count:", rows.length);
    console.log("Header:", rows[0]);
    console.log("First 5 data rows:");
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      console.log(rows[i]);
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
