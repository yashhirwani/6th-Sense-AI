// Verifies every Material Symbol referenced in src/ exists in the bundled font (glyphs.json).
// Scans name="..." / icon: '...' / icon="..." / L('x', 'icon', ...) patterns.  Run: node scripts/check-icons.js
const fs = require('fs');
const path = require('path');
const glyphs = require('../src/components/icons/glyphs.json');
const SUBSTITUTES = ['chat_spark', 'pixel_4_4xl_4a_5_5a_5g'];
const found = new Map();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|js)$/.test(f)) {
      const src = fs.readFileSync(p, 'utf8');
      const res = [/<Icon[^>]*?\bname="([a-z0-9_]+)"/g, /<Icon[^>]*?\bname=\{[^}]*?\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g, /\bicon[=:]\s*["']([a-z0-9_]+)["']/g, /\bicon="([a-z0-9_]+)"/g, /\bL\('[^']+',\s*'([a-z0-9_]+)'/g, /\bicon:\s*'([a-z0-9_]+)'/g];
      for (const re of res) for (const m of src.matchAll(re)) for (const g of m.slice(1)) if (g) found.set(g, p);
    }
  }
}
walk(path.join(__dirname, '..', 'src'));
const missing = [...found].filter(([n]) => glyphs[n] === undefined && !SUBSTITUTES.includes(n));
if (missing.length) {
  for (const [n, p] of missing) console.log(`MISSING icon "${n}" in ${p}`);
  process.exit(1);
}
console.log(`${found.size} icon names OK`);
