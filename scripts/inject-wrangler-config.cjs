const fs = require('fs');
const path = require('path');

const wranglerPath = path.join(__dirname, '..', 'wrangler.toml');
let content = fs.readFileSync(wranglerPath, 'utf-8');

function replacePlaceholder(placeholder, value) {
  if (!value) {
    console.warn(`Warning: ${placeholder} is not set, leaving placeholder in wrangler.toml`);
    return;
  }
  // 使用正则全局替换，避免 value 中的特殊字符被当作正则解析
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  content = content.replace(regex, value);
}

replacePlaceholder('KV_AUTH_TOKENS_ID', process.env.KV_AUTH_TOKENS_ID);
replacePlaceholder('KV_VERIFICATION_CODES_ID', process.env.KV_VERIFICATION_CODES_ID);
replacePlaceholder('D1_DATABASE_ID', process.env.D1_DATABASE_ID);

// 处理 vars 段
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
if (turnstileSiteKey) {
  if (!content.match(/^\[vars\]\s*$/m)) {
    content += '\n[vars]\n';
  }
  // 删除已有的 TURNSTILE_SITE_KEY 行
  content = content.replace(/^TURNSTILE_SITE_KEY\s*=.*\n?/gm, '');
  // 在 [vars] 后添加新的行
  content = content.replace(/^(\[vars\]\s*)\n?/m, `$1\nTURNSTILE_SITE_KEY = "${turnstileSiteKey}"\n`);
}

fs.writeFileSync(wranglerPath, content);
console.log('wrangler.toml updated successfully.');
