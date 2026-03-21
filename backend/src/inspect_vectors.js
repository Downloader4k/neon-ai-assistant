
const fs = require('fs');
const path = require('path');

const vectorsPath = path.resolve(__dirname, '../data/vectors.json');

console.log('--- INSPECTING VECTORS.JSON ---');
console.log('Path:', vectorsPath);

if (!fs.existsSync(vectorsPath)) {
    console.log('ERROR: File not found!');
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    console.log(`Total entries: ${data.length}`);

    const keywords = ['hobby', 'mag', 'liebe', 'spiele', 'python', 'film', 'serie'];
    console.log(`Searching for keywords: ${keywords.join(', ')}`);

    let found = 0;
    data.forEach((entry, i) => {
        const content = entry.document.toLowerCase();
        const matches = keywords.filter(k => content.includes(k));

        if (matches.length > 0) {
            console.log(`\n[${i}] Matches: ${matches.join(', ')}`);
            console.log(`Content: ${entry.document.substring(0, 100)}...`); // Truncate
            console.log(`Role: ${entry.metadata.role}`);
            found++;
        }
    });

    console.log(`\nFound ${found} matching entries.`);

} catch (e) {
    console.error('Error parsing JSON:', e);
}
