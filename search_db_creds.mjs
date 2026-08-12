import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function search(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.vite') continue;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            search(fullPath);
        } else {
            if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.mjs') || file.endsWith('.json') || file.endsWith('.py') || file.endsWith('.env') || file.endsWith('.local') || file.endsWith('.sql')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes('ctmguadalupe') || content.includes('postgresql:') || content.includes('pwquntnvqwdcrmtjgedb')) {
                        console.log(`Found reference in ${fullPath}`);
                        // Log lines containing the keywords
                        const lines = content.split('\n');
                        lines.forEach((line, idx) => {
                            if (line.includes('ctmguadalupe') || line.includes('postgresql:') || line.includes('pwquntnvqwdcrmtjgedb') || line.includes('password') || line.includes('pass')) {
                                console.log(`  L${idx+1}: ${line.trim().slice(0, 120)}`);
                            }
                        });
                    }
                } catch (e) {}
            }
        }
    }
}

search(rootDir);
