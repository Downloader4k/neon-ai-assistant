/**
 * Neon AI Assistant - Logo Generator
 * Erzeugt PNG-Dateien in verschiedenen Größen + favicon.ico aus logo.svg
 * Benötigt: sharp (via openclaw)
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Sharp aus openclaw node_modules laden
const sharp = require('sharp');

const PUBLIC_DIR = join(__dirname, '../frontend/public');
const SVG_PATH = join(PUBLIC_DIR, 'logo.svg');

const svgBuffer = readFileSync(SVG_PATH);

// PNG-Größen die generiert werden sollen
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

// ICO-Größen (was ins .ico file kommt)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

console.log('🎨 Neon AI Assistant - Logo Generator');
console.log('======================================');

// PNGs generieren
const pngBuffers = {};

for (const size of PNG_SIZES) {
  const filename = size === 512 ? 'logo-512.png' : `logo-${size}.png`;
  const outputPath = join(PUBLIC_DIR, filename);

  const pngBuffer = await sharp(svgBuffer)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(outputPath, pngBuffer);
  pngBuffers[size] = pngBuffer;
  console.log(`✅ ${filename.padEnd(16)} (${size}x${size}) → ${(pngBuffer.length / 1024).toFixed(1)} KB`);
}

// Hauptlogo-PNG (ohne Größensuffix, 512px)
writeFileSync(join(PUBLIC_DIR, 'logo.png'), pngBuffers[512]);
console.log(`✅ logo.png          (512x512) → ${(pngBuffers[512].length / 1024).toFixed(1)} KB`);

// favicon.ico erstellen (enthält mehrere Größen)
const icoBuffer = createIco(ICO_SIZES.map(size => ({
  size,
  pngBuffer: pngBuffers[size]
})));

writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
console.log(`✅ favicon.ico       (multi-size: ${ICO_SIZES.join(', ')}px) → ${(icoBuffer.length / 1024).toFixed(1)} KB`);

console.log('\n📁 Alle Dateien gespeichert in: frontend/public/');
console.log('\nGenerierte Dateien:');
console.log('  logo.svg          - Skalierbare Vektor-Version (512x512 viewBox)');
console.log('  favicon.svg       - Optimiertes Browser-Favicon (32x32 viewBox)');
console.log('  logo.png          - Hauptlogo PNG (512x512)');
PNG_SIZES.filter(s => s !== 512).forEach(s => {
  console.log(`  logo-${s}.png`.padEnd(20) + `- PNG ${s}x${s}`);
});
console.log(`  logo-512.png      - PNG 512x512 (identisch mit logo.png)`);
console.log('  favicon.ico       - Windows ICO (16/24/32/48/64/128/256px)');

// ─── ICO Format Writer ────────────────────────────────────────────────────────
/**
 * Erstellt eine ICO-Datei mit eingebetteten PNG-Bildern (PNG-in-ICO Format).
 * Unterstützt von Windows Vista+ und allen modernen Browsern.
 *
 * ICO Header:   6 Bytes
 * Dir-Einträge: 16 Bytes × Anzahl
 * Bilddaten:    PNG-Bytes jedes Bildes
 */
function createIco(images) {
  const count = images.length;
  const HEADER_SIZE = 6;
  const DIR_ENTRY_SIZE = 16;
  const dataStartOffset = HEADER_SIZE + count * DIR_ENTRY_SIZE;

  // Offsets für jedes Bild berechnen
  let currentOffset = dataStartOffset;
  const offsets = images.map(img => {
    const offset = currentOffset;
    currentOffset += img.pngBuffer.length;
    return offset;
  });

  const totalSize = currentOffset;
  const buf = Buffer.alloc(totalSize);

  // ICO Header schreiben
  buf.writeUInt16LE(0, 0);      // Reserved (muss 0 sein)
  buf.writeUInt16LE(1, 2);      // Typ: 1 = ICO
  buf.writeUInt16LE(count, 4);  // Anzahl der Bilder

  // Directory-Einträge schreiben
  images.forEach((img, i) => {
    const base = HEADER_SIZE + i * DIR_ENTRY_SIZE;
    // Breite/Höhe: 0 = 256px (Windows Konvention für ≥256)
    buf.writeUInt8(img.size >= 256 ? 0 : img.size, base);      // Breite
    buf.writeUInt8(img.size >= 256 ? 0 : img.size, base + 1);  // Höhe
    buf.writeUInt8(0, base + 2);   // Farben in Palette (0 = keine Palette)
    buf.writeUInt8(0, base + 3);   // Reserved
    buf.writeUInt16LE(1, base + 4);   // Color planes
    buf.writeUInt16LE(32, base + 6);  // Bits per pixel (32-bit RGBA)
    buf.writeUInt32LE(img.pngBuffer.length, base + 8);   // Datengröße
    buf.writeUInt32LE(offsets[i], base + 12);             // Daten-Offset
  });

  // PNG-Daten schreiben
  images.forEach((img, i) => {
    img.pngBuffer.copy(buf, offsets[i]);
  });

  return buf;
}
