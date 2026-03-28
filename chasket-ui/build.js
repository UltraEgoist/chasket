#!/usr/bin/env node
/**
 * Build script for @chasket/chasket-ui
 *
 * Compiles all .csk components in components/ to individual JS files
 * and a combined bundle (dist/chasket-ui.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { compile } = require('../chasket-cli/lib/compiler');

const COMPONENTS_DIR = path.join(__dirname, 'components');
const DIST_DIR = path.join(__dirname, 'dist');

function build() {
  // Ensure dist/ exists
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

  const chasketFiles = fs.readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.csk'));

  const bundleParts = [];
  const componentNames = [];
  let errorCount = 0;

  for (const file of chasketFiles) {
    const src = fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8');
    const result = compile(src, file);

    if (!result.success) {
      console.error(`✗ ${file}`);
      for (const d of result.diagnostics) {
        console.error(`  ${d.level}: ${d.message} (line ${d.span?.line || '?'})`);
      }
      errorCount++;
      continue;
    }

    // Strip sourceMappingURL for bundle
    const code = result.output.replace(/\n\/\/# sourceMappingURL=.*$/, '');

    // Write individual file
    const jsName = file.replace('.csk', '.js');
    fs.writeFileSync(path.join(DIST_DIR, jsName), result.output, 'utf-8');

    // Add to bundle
    const tagName = file.replace('.csk', '');
    bundleParts.push(`// ── ${tagName} ──\n${code}`);
    componentNames.push(tagName);

    // Warnings
    const warns = result.diagnostics.filter(d => d.level === 'warning');
    const status = warns.length > 0 ? `✓ ${file} (${warns.length} warning(s))` : `✓ ${file}`;
    console.log(status);
  }

  // Write combined bundle
  const banner = `/**\n * @chasket/chasket-ui v0.1.0\n * Components: ${componentNames.join(', ')}\n * Generated: ${new Date().toISOString()}\n */\n\n`;
  const bundle = banner + bundleParts.join('\n\n');
  fs.writeFileSync(path.join(DIST_DIR, 'chasket-ui.js'), bundle, 'utf-8');

  console.log(`\nBuild complete: ${componentNames.length} components → dist/chasket-ui.js`);
  if (errorCount > 0) {
    console.error(`${errorCount} component(s) failed to compile.`);
    process.exit(1);
  }
}

build();
