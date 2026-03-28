#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { compile } = require('../../chasket-cli/lib/compiler');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.csk'));
let success = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(srcDir, file), 'utf-8');
  const result = compile(source, file);

  if (result.success) {
    fs.writeFileSync(path.join(distDir, file.replace('.csk', '.js')), result.output);
    console.log(`✓ ${file}`);
    success++;
  } else {
    console.error(`✗ ${file}:`);
    for (const d of result.diagnostics) {
      console.error(`  [${d.code}] ${d.message}`);
    }
  }
}

console.log(`\nCompiled ${success}/${files.length} components`);
process.exit(success === files.length ? 0 : 1);
