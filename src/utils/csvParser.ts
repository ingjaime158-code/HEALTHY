/**
 * RFC-4180 compliant CSV/TSV/Semicolon parser that correctly handles
 * double quotes, escaped quotes, and newlines within fields.
 */
export function parseCsv(text: string): string[][] {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    if (!text || !text.trim()) return [];

    // Simple delimiter detection based on the first line
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : ';');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
                currentField += '"';
                i++; // Skip the next quote (escaped double quote)
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                i++;
            }
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

    // Filter out completely empty rows
    return result.filter(row => row.some(field => field.length > 0));
}
