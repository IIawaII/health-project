const fs = require('fs');
const path = require('path');

const wranglerPath = path.join(__dirname, '..', 'wrangler.toml');
const originalContent = fs.readFileSync(wranglerPath, 'utf-8');
let content = originalContent;

const requiredPlaceholders = [
  'KV_AUTH_TOKENS_ID',
  'KV_VERIFICATION_CODES_ID',
  'KV_SSRF_CACHE_ID',
  'D1_DATABASE_ID',
  'ROUTE_PATTERN',
  'ROUTE_ZONE_NAME',
];

const missingValues = [];

function replacePlaceholder(placeholder, value) {
  if (!value) {
    missingValues.push(placeholder);
    console.warn(`Warning: ${placeholder} is not set, leaving placeholder in wrangler.toml`);
    return;
  }
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  content = content.replace(regex, value);
}

replacePlaceholder('KV_AUTH_TOKENS_ID', process.env.KV_AUTH_TOKENS_ID);
replacePlaceholder('KV_VERIFICATION_CODES_ID', process.env.KV_VERIFICATION_CODES_ID);
replacePlaceholder('KV_SSRF_CACHE_ID', process.env.KV_SSRF_CACHE_ID);
replacePlaceholder('D1_DATABASE_ID', process.env.D1_DATABASE_ID);
replacePlaceholder('ROUTE_PATTERN', process.env.ROUTE_PATTERN);
replacePlaceholder('ROUTE_ZONE_NAME', process.env.ROUTE_ZONE_NAME);

if (missingValues.length > 0) {
  console.error(`Error: Required configuration values not set: ${missingValues.join(', ')}`);
  console.error('Please configure these in GitHub Secrets before deploying.');
  process.exit(1);
}

const remainingPlaceholders = requiredPlaceholders.filter(p => content.includes(p));
if (remainingPlaceholders.length > 0) {
  console.error(`Error: Placeholders not replaced: ${remainingPlaceholders.join(', ')}`);
  process.exit(1);
}

const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
function addVarLine(key, value) {
  if (!value) return;
  if (!content.match(/^\[vars\]\s*$/m)) {
    content += '\n[vars]\n';
  }
  content = content.replace(new RegExp(`^${key}\\s*=.*\\n?`, 'gm'), '');
  content = content.replace(/^(\[vars\]\s*)\n?/m, `$1\n${key} = "${value}"\n`);
}

addVarLine('TURNSTILE_SITE_KEY', turnstileSiteKey);
addVarLine('SMTP_HOST', process.env.SMTP_HOST);
addVarLine('SMTP_PORT', process.env.SMTP_PORT);
addVarLine('ENVIRONMENT', process.env.ENVIRONMENT || 'production');

fs.writeFileSync(wranglerPath, content);
console.log('wrangler.toml updated successfully.');

process.on('exit', (code) => {
  if (code !== 0) {
    fs.writeFileSync(wranglerPath, originalContent);
    console.log('wrangler.toml restored to original state due to error.');
  }
});
