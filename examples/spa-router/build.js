#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { compile } = require('../../chasket-cli/lib/compiler');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.csk'));
const bundleParts = [];
let success = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(srcDir, file), 'utf-8');
  const result = compile(source, file);

  if (result.success) {
    fs.writeFileSync(path.join(distDir, file.replace('.csk', '.js')), result.output);
    const code = result.output.replace(/\n\/\/# sourceMappingURL=.*$/, '');
    bundleParts.push(`// ── ${file} ──\n${code}`);
    console.log(`✓ ${file}`);
    success++;
  } else {
    console.error(`✗ ${file}:`);
    for (const d of result.diagnostics) {
      console.error(`  [${d.code}] ${d.message}`);
    }
  }
}

// Generate bundle
if (bundleParts.length > 0) {
  const header = `// Chasket SPA Router Demo Bundle\n// ${bundleParts.length} component(s)\n\n`;
  const deferred = `const __chasketDefineQueue = [];\nif (typeof window !== 'undefined') window.__chasketClasses = window.__chasketClasses || {};\n\n`;
  const footer = `\n__chasketDefineQueue.forEach(([tag, cls]) => {\n  if (!customElements.get(tag)) customElements.define(tag, cls);\n});\n`;
  fs.writeFileSync(path.join(distDir, 'spa-bundle.js'), header + deferred + bundleParts.join('\n') + footer);
}

console.log(`\nCompiled ${success}/${files.length} components`);
process.exit(success === files.length ? 0 : 1);
