// Regenerates global.css colour variables from src/theme/palette.js.  Run: node scripts/gen-theme-css.js
const fs = require('fs');
const path = require('path');
const { lightColors, darkColors, toCssVars } = require('../src/theme/palette');

const block = (sel, p) =>
  `${sel} {\n${Object.entries(toCssVars(p)).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

const css =
  '/* GENERATED from src/theme/palette.js by scripts/gen-theme-css.js - do not edit by hand. */\n' +
  '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' +
  block(':root', lightColors) + '\n' + block('.dark:root', darkColors);

fs.writeFileSync(path.join(__dirname, '..', 'global.css'), css);
console.log('global.css written');
