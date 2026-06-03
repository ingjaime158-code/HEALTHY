import fs from 'fs';

const content = fs.readFileSync('src/components/NewClientSidebar.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('pushToGoogleSheets')) {
    console.log(`Lines ${idx - 2} to ${idx + 20}:`);
    for (let i = Math.max(0, idx - 2); i < Math.min(lines.length, idx + 20); i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
});
