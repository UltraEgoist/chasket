#!/usr/bin/env node

/**
 * create-chasket
 *
 * npm create chasket / npm init chasket で実行される薄いラッパー。
 * @chasket/chasket の init コマンドを npx 経由で呼び出す。
 */

const { execSync } = require('child_process');

// 引数をそのまま転送（例: npm create chasket my-app）
const args = process.argv.slice(2).join(' ');

try {
  execSync(`npx @chasket/chasket init ${args}`, {
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch {
  process.exit(1);
}
