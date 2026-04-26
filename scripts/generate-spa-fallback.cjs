const fs = require('fs');
const path = require('path');

const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
const outputPath = path.join(__dirname, '..', 'server', 'generated', 'spa-fallback-html.ts');

if (!fs.existsSync(distIndexPath)) {
  console.warn('Warning: dist/index.html not found. Skipping spa-fallback-html update.');
  process.exit(0);
}

const html = fs.readFileSync(distIndexPath, 'utf-8');

// Keep hashed asset paths as-is so that env.ASSETS can serve the exact files.
const normalized = html;

// Escape template literals and backslashes for TypeScript string
const escaped = normalized
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\\\$/g, '\\$');

const tsContent = `export const FALLBACK_HTML = \`${escaped}\`\n`;

const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
if (existing === tsContent) {
  console.log('src/spa-fallback-html.ts is up to date, skipping write.');
  process.exit(0);
}

fs.writeFileSync(outputPath, tsContent);
console.log('src/spa-fallback-html.ts updated with normalized dist/index.html content.');
