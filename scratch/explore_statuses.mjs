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

const MORNING_SHEET_ID = "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const EVENING_SHEET_ID = "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";
const MORNING_GID = "1075208342";
const EVENING_GID = "2039339913";

async function run() {
  try {
    const urlMorning = `https://docs.google.com/spreadsheets/d/${MORNING_SHEET_ID}/export?format=csv&gid=${MORNING_GID}`;
    const urlEvening = `https://docs.google.com/spreadsheets/d/${EVENING_SHEET_ID}/export?format=csv&gid=${EVENING_GID}`;

    console.log("Fetching Morning Statuses...");
    const resM = await fetch(urlMorning);
    const textM = await resM.text();
    const rowsM = parseCsvContent(textM);
    
    const headerM = rowsM[0].map(h => h.toUpperCase());
    const estIdxM = headerM.findIndex(h => h.includes('ESTADO') || h.includes('ESTATUS'));
    const nameIdxM = headerM.findIndex(h => h.includes('NOMBRE'));
    const repIdxM = headerM.findIndex(h => h.includes('REPARTIDOR'));
    
    console.log("Morning row samples (first 10):");
    for (let i = 1; i < Math.min(rowsM.length, 10); i++) {
      console.log(`Row ${i}: Estado: "${rowsM[i][estIdxM]}", Nombre: "${rowsM[i][nameIdxM]}", Repartidor: "${rowsM[i][repIdxM]}"`);
    }

    console.log("\nFetching Evening Statuses...");
    const resE = await fetch(urlEvening);
    const textE = await resE.text();
    const rowsE = parseCsvContent(textE);
    
    const headerE = rowsE[0].map(h => h.toUpperCase());
    const estIdxE = headerE.findIndex(h => h.includes('ESTADO') || h.includes('ESTATUS'));
    const nameIdxE = headerE.findIndex(h => h.includes('NOMBRE'));
    const repIdxE = headerE.findIndex(h => h.includes('REPARTIDOR'));
    
    console.log("Evening row samples (first 10):");
    for (let i = 1; i < Math.min(rowsE.length, 10); i++) {
      console.log(`Row ${i}: Estatus: "${rowsE[i][estIdxE]}", Nombre: "${rowsE[i][nameIdxE]}", Repartidor: "${rowsE[i][repIdxE]}"`);
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
