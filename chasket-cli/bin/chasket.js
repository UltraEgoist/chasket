#!/usr/bin/env node

/**
 * @fileoverview Chasket CLI - Web Component Compiler Command-Line Interface
 *
 * このファイルは Chasket CLI の メインエントリーポイントです。
 * 以下の4つのコマンドをサポートしています：
 *
 * - init    : 新規プロジェクトの雛形を生成
 * - build   : 本番ビルド（全 .csk ファイルをコンパイル、バンドル生成）
 * - dev     : 開発サーバー起動（ファイル監視、ホットリビルド対応）
 * - check   : 型チェックのみ実行（出力生成なし）
 *
 * ## アーキテクチャ
 *
 * 1. **コマンド ディスパッチ**: process.argv[2] でコマンド判定 → 対応関数呼び出し
 * 2. **設定管理**: chasket.config.json から設定読み込み（デフォルト値でフォールバック）
 * 3. **コンパイラ連携**: ../lib/compiler の compile() 関数で .csk → JS/TS 変換
 * 4. **バンドルシステム**: 全コンポーネントを __chasketDefineQueue で遅延登録
 *    → 親・子コンポーネント順序に依存しない登録を実現
 * 5. **開発サーバー**: Node.js http モジュールで静的ファイル配信
 *    → パストラバーサル対策、シンリンク解決済み
 *
 * ## セキュリティ対策
 *
 * - パストラバーサル防止: ".." や "\0" を含むパスを拒否
 * - シンリンク解決: fs.realpathSync() で実パスを取得、allowedRoots チェック
 * - CORS/CSP ヘッダ: 開発時の動的コンテンツ読み込みに対応しつつ、不正スクリプト注入を制限
 * - プロジェクト名検証: npm 標準の package name パターンに準拠
 */

// ============================================================
// Chasket CLI
// Commands: init, build, dev, check
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { compile } = require('../lib/compiler');
const { msg } = require('../lib/messages');

const VERSION = '0.2.0';
const args = process.argv.slice(2);
const cmd = args[0];

// ─── Minifier ───

/**
 * 軽量 JavaScript ミニファイア
 *
 * 以下の最適化を実行:
 * 1. 行コメント (//) の除去
 * 2. ブロックコメント の除去 (ただし /*! ライセンスコメントは保持)
 * 3. 連続空白の圧縮
 * 4. 空行の除去
 * 5. 行頭・行末の不要な空白除去
 *
 * 文字列リテラル内のコメント記号を誤除去しないよう、
 * 文字列・正規表現・テンプレートリテラルをスキップします。
 *
 * @param {string} code - 入力 JavaScript コード
 * @returns {string} 最小化されたコード
 */
function minifyJS(code) {
  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // 文字列リテラル（シングル / ダブルクォート）
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let str = ch;
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          str += code[i] + (i + 1 < len ? code[i + 1] : '');
          i += 2;
          continue;
        }
        str += code[i];
        if (code[i] === quote) { i++; break; }
        i++;
      }
      result += str;
      continue;
    }

    // テンプレートリテラル
    if (ch === '`') {
      let str = ch;
      i++;
      let depth = 0;
      while (i < len) {
        if (code[i] === '\\') {
          str += code[i] + (i + 1 < len ? code[i + 1] : '');
          i += 2;
          continue;
        }
        if (code[i] === '$' && i + 1 < len && code[i + 1] === '{') {
          str += '${';
          i += 2;
          depth++;
          continue;
        }
        if (code[i] === '{' && depth > 0) { depth++; }
        if (code[i] === '}' && depth > 0) { depth--; }
        str += code[i];
        if (code[i] === '`' && depth === 0) { i++; break; }
        i++;
      }
      result += str;
      continue;
    }

    // ブロックコメント
    if (ch === '/' && i + 1 < len && code[i + 1] === '*') {
      // /*! ライセンスコメントは保持
      const isLicense = i + 2 < len && code[i + 2] === '!';
      const end = code.indexOf('*/', i + 2);
      if (end === -1) { i = len; break; }
      if (isLicense) {
        result += code.slice(i, end + 2);
      }
      i = end + 2;
      continue;
    }

    // 行コメント
    if (ch === '/' && i + 1 < len && code[i + 1] === '/') {
      // 行末まで飛ばす
      const eol = code.indexOf('\n', i);
      if (eol === -1) { i = len; break; }
      i = eol; // \n はそのまま（後で空行除去で処理）
      continue;
    }

    result += ch;
    i++;
  }

  // 連続空白の圧縮と空行除去
  const lines = result.split('\n');
  const compressed = [];
  for (const line of lines) {
    // 行内の連続空白を単一スペースに
    const trimmed = line.replace(/[ \t]+/g, ' ').trim();
    if (trimmed.length > 0) {
      compressed.push(trimmed);
    }
  }

  return compressed.join('\n');
}

// ─── Color helpers ───
/**
 * ターミナルの ANSI カラーコード定義と色付けヘルパー関数
 * @type {Object}
 * @property {string} reset - リセットコード
 * @property {string} bold - 太字コード
 * @property {string} dim - 薄暗いコード
 * @property {string} red - 赤色コード
 * @property {string} green - 緑色コード
 * @property {string} yellow - 黄色コード
 * @property {string} cyan - シアンコード
 * @property {Function} ok - 成功メッセージ（緑色）
 * @property {Function} err - エラーメッセージ（赤色）
 * @property {Function} warn - 警告メッセージ（黄色）
 * @property {Function} info - 情報メッセージ（シアン色）
 * @property {Function} b - 太字テキスト
 * @property {Function} d - 薄暗いテキスト
 */
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  ok(t) { return `${this.green}${t}${this.reset}`; },
  err(t) { return `${this.red}${t}${this.reset}`; },
  warn(t) { return `${this.yellow}${t}${this.reset}`; },
  info(t) { return `${this.cyan}${t}${this.reset}`; },
  b(t) { return `${this.bold}${t}${this.reset}`; },
  d(t) { return `${this.dim}${t}${this.reset}`; },
};

/**
 * CLI ヘッダーバナーを表示する
 * Chasket のロゴとバージョン情報を表示（初期化時、ビルド開始時など）
 *
 * @function banner
 * @returns {void}
 */
function banner() {
  console.log(`\n${c.info('╔══════════════════════════════════════════╗')}`);
  console.log(`${c.info('║')}      Chasket v${VERSION}                        ${c.info('║')}`);
  console.log(`${c.info('╚══════════════════════════════════════════╝')}\n`);
}

// ═══════════════════════════════════════════
// chasket init <project-name>
// ═══════════════════════════════════════════

/**
 * 新規 Chasket プロジェクトの雛形を生成する
 *
 * プロジェクト構造：
 * ```
 * <project>/
 *   ├── chasket.config.json  - Chasket 設定ファイル
 *   ├── package.json       - npm パッケージ定義
 *   ├── src/
 *   │   ├── index.html     - サンプル HTML
 *   │   ├── components/
 *   │   │   └── app.csk  - ルートコンポーネント
 *   │   └── lib/
 *   │       └── utils.ts   - ユーティリティ関数プレースホルダ
 *   └── dist/              - ビルド出力先（空）
 * ```
 *
 * ## プロジェクト名検証
 * npm の package name 標準に準拠：
 * - 小文字のみ
 * - 数字、ハイフン、アンダースコア、ドットを含可能
 * - 先頭は小文字か数字
 * パターン: /^[a-z0-9][-a-z0-9_.]*$/
 *
 * @function cmdInit
 * @returns {void}
 */
function cmdInit() {
  const name = args[1];
  if (!name) { console.error(c.err('Usage: chasket init <project-name>')); process.exit(1); }

  // P1-26: Validate project name (npm standard: lowercase, numbers, hyphens, underscores, dots)
  // プロジェクト名がパッケージ名として有効か検証
  // これにより npm publish 時のエラーを事前に防ぐ
  if (!/^[a-z0-9][-a-z0-9_.]*$/.test(name)) {
    console.error(c.err(msg('CLI_INIT_INVALID_NAME', {name})));
    process.exit(1);
  }

  const dir = path.resolve(name);
  // 既存ディレクトリの存在確認（既存プロジェクトへの誤上書き防止）
  if (fs.existsSync(dir)) { console.error(c.err(msg('CLI_INIT_EXISTS', {dir: name}))); process.exit(1); }

  console.log(`\n  ${c.info('▸')} ${c.b('Creating')} ${name}/\n`);

  // Create directories
  // プロジェクト構造の基本ディレクトリをすべて作成
  const dirs = [
    '',
    'src',
    'src/components',
    'src/lib',
    'dist',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // chasket.config.json - ビルドとコンパイルの設定ファイル
  fs.writeFileSync(path.join(dir, 'chasket.config.json'), JSON.stringify({
    target: 'js',
    outdir: 'dist',
    bundle: 'chasket-bundle.js',
    shadow: 'open',
    sourcemap: false,
    minify: false,
    src: 'src/components',
  }, null, 2) + '\n');
  console.log(`    ${c.ok('✓')} chasket.config.json`);

  // package.json - npm パッケージメタデータと NPM scripts
  // npx 経由で chasket を実行することで、グローバルインストール不要にする
  // devDependencies に @aspect/chasket を追加し、npm install 後は npx なしでも動作
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: name,
    version: '0.0.1',
    private: true,
    scripts: {
      dev: 'npx chasket dev',
      build: 'npx chasket build',
      check: 'npx chasket check',
    },
    devDependencies: {
      '@aspect/chasket': '^0.2.0',
    },
  }, null, 2) + '\n');
  console.log(`    ${c.ok('✓')} package.json`);

  // Root component: app.csk
  // サンプルコンポーネント：シンプルなカウンター実装
  const appChasket = `<meta>
  name: "x-app"
  shadow: open
</meta>

<script>
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <div class="app">
    <h1>Chasket へようこそ！</h1>
    <p>このコンポーネントを編集して開発を始めましょう。</p>
    <div class="counter">
      <span class="value">{{ count }}</span>
      <button class="btn" @click="increment">+1</button>
    </div>
  </div>
</template>

<style>
  .app {
    font-family: 'Segoe UI', system-ui, sans-serif;
    max-width: 480px;
    margin: 60px auto;
    text-align: center;
    color: #333;
  }
  h1 {
    font-size: 2rem;
    margin: 0 0 8px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p {
    color: #888;
    margin: 0 0 32px;
  }
  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .value {
    font-size: 3rem;
    font-weight: 700;
    color: #667eea;
    min-width: 80px;
  }
  .btn {
    padding: 12px 32px;
    border-radius: 8px;
    border: none;
    background: #667eea;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }
  .btn:hover { background: #5a6fd6; }
  .btn:active { transform: scale(0.96); }
</style>
`;
  fs.writeFileSync(path.join(dir, 'src', 'components', 'app.csk'), appChasket);
  console.log(`    ${c.ok('✓')} src/components/app.csk`);

  // index.html - エントリーHTMLファイル
  // コンパイル済みのバンドル JS を読み込み、ルートコンポーネント <x-app> をマウント
  const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; background: #fafafa; }
  </style>
</head>
<body>
  <x-app></x-app>
  <!-- Chasket: 全コンポーネントが1つにバンドルされます -->
  <script src="dist/chasket-bundle.js"><\/script>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, 'src', 'index.html'), indexHtml);
  console.log(`    ${c.ok('✓')} src/index.html`);

  // utils.ts placeholder - TypeScript ユーティリティ関数のサンプル
  fs.writeFileSync(path.join(dir, 'src', 'lib', 'utils.ts'), '// ユーティリティ関数をここに記述\nexport function formatDate(d: Date): string {\n  return d.toLocaleDateString("ja-JP");\n}\n');
  console.log(`    ${c.ok('✓')} src/lib/utils.ts`);

  console.log(`\n  ${c.ok('✓ Done!')}\n`);
  console.log(`  次のステップ:\n`);
  console.log(`    ${c.b(`cd ${name}`)}`);
  console.log(`    ${c.b('npm install')}        # 依存関係をインストール`);
  console.log(`    ${c.b('npm run dev')}        # 開発サーバーを起動\n`);
  console.log(`  もしくは直接実行:\n`);
  console.log(`    ${c.b('npx chasket dev')}    # npx 経由`);
  console.log(`    ${c.b('node <path>/chasket-cli/bin/chasket.js dev')}  # 直接実行\n`);
}

// ═══════════════════════════════════════════
// chasket build
// ═══════════════════════════════════════════

/**
 * 本番ビルドを実行する
 *
 * 処理の流れ：
 * 1. chasket.config.json から設定を読み込む（CLI引数でオーバーライド可）
 * 2. ソースディレクトリ内のすべての .csk ファイルを探す
 * 3. 各ファイルをコンパイル（JS または TS 出力）
 * 4. 出力先ディレクトリ/components/ に個別ファイルを生成
 * 5. すべてのコンパイル済みコンポーネントを1つの Bundle にまとめる
 * 6. Bundle 内で __chasketDefineQueue を使用して遅延登録を実装
 *
 * ## バンドルシステム (__chasketDefineQueue)
 * コンポーネントの登録順序に依存するバグを防ぐため、以下の仕組みを採用：
 * - コンパイラが各コンポーネントクラスを定義する際、
 *   __chasketDefineQueue.push([tagName, ComponentClass]) で キュー登録
 * - Bundle の末尾で、キュー内のすべてのコンポーネントを customElements.define()
 * - これにより、親コンポーネントが出現する前に子コンポーネントが
 *   customElements に登録済みの状態が保証される
 *
 * @function cmdBuild
 * @returns {void}
 */
function cmdBuild() {
  const config = loadConfig();
  // CLI引数 > config ファイル > デフォルト値 の優先度で設定値を決定
  const target = getArg('--target') || config.target || 'js';
  // NEW-OPT: Enable bundle size optimization (tree-shaking) for bundle files
  const optimize = getArg('--optimize') === 'true' || config.optimize === true;

  banner();

  // ─── entries 配列対応: ディレクトリ別ビルド ───
  // config.entries が存在する場合は、各エントリを個別にビルド
  // 存在しない場合は従来通り src/outdir の単一ペアでビルド
  const entries = config.entries || [{
    src: config.src || args[1] || 'src/components',
    outdir: getArg('--outdir') || config.outdir || config.output || 'dist',
    bundle: config.bundle || 'chasket-bundle.js',
  }];

  let totalSuccess = 0, totalFail = 0;

  for (const entry of entries) {
    const srcDir = path.resolve(entry.src);
    const outDir = path.resolve(entry.outdir || entry.output || 'dist');
    const bundleName = entry.bundle || config.bundle || 'chasket-bundle.js';

    if (entries.length > 1) {
      console.log(`\n${c.info('━━━')} Entry: ${c.b(entry.src)} → ${c.b(entry.outdir || 'dist')} ${c.info('━━━')}\n`);
    }

    const { success, fail } = buildEntry(srcDir, outDir, bundleName, target, optimize, config);
    totalSuccess += success;
    totalFail += fail;
  }

  // ─── TypeScript file transpilation ───
  const srcBase = path.resolve(config.src || args[1] || 'src');
  const srcParent = entries.length === 1 ? path.dirname(path.resolve(entries[0].src)) : srcBase;
  const tsOutDir = entries.length === 1 ? path.resolve(entries[0].outdir || 'dist') : path.resolve(config.outdir || 'dist');
  const tsFiles = collectTsFiles(srcParent);
  if (tsFiles.length > 0) {
    console.log(`\n${c.info('▸')} Transpiling ${tsFiles.length} TypeScript file(s)...`);
    for (const tsFile of tsFiles) {
      const relPath = path.relative(srcParent, tsFile);
      const outPath = path.join(tsOutDir, relPath.replace(/\.tsx?$/, '.js'));
      const outDirForFile = path.dirname(outPath);
      fs.mkdirSync(outDirForFile, { recursive: true });
      const tsContent = fs.readFileSync(tsFile, 'utf-8');
      const jsContent = stripTypes(tsContent);
      fs.writeFileSync(outPath, jsContent);
      console.log(`  ${c.ok('✓')} → ${path.relative(tsOutDir, outPath)}`);
    }
  }

  console.log(`\n${c.ok('Done!')} ${totalSuccess}/${totalSuccess + totalFail} files compiled.\n`);
  if (totalFail > 0) process.exit(1);
}

/**
 * 単一エントリ（src→outdir ペア）のビルドを実行する
 *
 * @param {string} srcDir - ソースディレクトリ
 * @param {string} outDir - 出力ディレクトリ
 * @param {string} bundleName - バンドルファイル名
 * @param {string} target - 出力ターゲット ('js' | 'ts')
 * @param {boolean} optimize - 最適化フラグ
 * @param {Object} config - 設定オブジェクト
 * @returns {{ success: number, fail: number }}
 */
function buildEntry(srcDir, outDir, bundleName, target, optimize, config) {

  if (!fs.existsSync(srcDir)) {
    console.error(c.err(msg('CLI_BUILD_NO_SRC', {path: srcDir})));
    return { success: 0, fail: 1 };
  }

  const componentsDir = path.join(outDir, 'components');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(componentsDir, { recursive: true });

  // ソースディレクトリから全 .csk ファイルを再帰的に探索
  const files = collectChasketFiles(srcDir);
  if (files.length === 0) {
    console.error(c.err(msg('CLI_BUILD_NO_FILES', {path: srcDir})));
    process.exit(1);
  }

  let success = 0, fail = 0;
  const bundleParts = [];
  const allUsedHelpers = new Set();  // Track helpers used across all components (for bundle optimization)

  // ─── Component Registry: Build tag→file mapping for auto-import ───
  // ソースディレクトリからの相対パスを使用し、サブディレクトリ構造を保持
  const componentRegistry = {};
  for (const file of files) {
    const bn = path.basename(file);
    const base = bn.replace(/\.csk$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    const tag = base.includes('-') ? base : 'x-' + base;
    // Also check <meta> for custom name
    const src = fs.readFileSync(file, 'utf-8');
    const nameMatch = src.match(/<meta[^>]*>[\s\S]*?name\s*:\s*"?([a-z][a-z0-9-]*)"?/);
    const actualTag = nameMatch ? nameMatch[1].trim() : tag;
    // ソースディレクトリからの相対パスを使ってサブディレクトリ構造を保持
    const relFromSrc = path.relative(srcDir, file).replace(/\.csk$/, '.js');
    componentRegistry[actualTag] = './' + relFromSrc.split(path.sep).join('/');
  }

  // 各 .csk ファイルをコンパイル
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    const fileName = path.basename(file);
    console.log(`${c.b('▸')} Compiling ${fileName}...`);

    // コンパイラ実行（../lib/compiler の compile() 関数を使用）
    // NEW-OPT: Pass optimize flag to enable tree-shaking
    // Pass component registry for auto-import resolution
    const result = compile(source, fileName, { target, optimize, componentRegistry, shadow: config.shadow });

    // 診断情報（エラー/警告）を表示
    for (const d of result.diagnostics) {
      const icon = d.level === 'error' ? c.err('✗') : c.warn('⚠');
      console.log(`  ${icon} [${d.code}] ${d.message}`);
      if (d.hint) console.log(`    ${c.d(`= hint: ${d.hint}`)}`);
    }

    if (result.success) {
      // 個別コンポーネントファイルを components/ サブディレクトリに出力
      // ソースディレクトリからの相対パスを維持してサブディレクトリ構造を保持
      // target が 'ts' の場合は .ts、デフォルト .js に変換
      const relPath = path.relative(srcDir, file);
      const outName = relPath.replace(/\.csk$/, `.${target === 'ts' ? 'ts' : 'js'}`);
      const outPath = path.join(componentsDir, outName);
      // サブディレクトリがある場合は作成
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      // 個別ファイルの import パスを、出力先ディレクトリからの相対パスに書き換え
      // 例: ./system/login/ch-userid.js → ファイルが system/main/ にある場合 → ../login/ch-userid.js
      let adjustedOutput = result.output;
      const outFileDir = path.dirname(outPath);
      adjustedOutput = adjustedOutput.replace(
        /^(import\s+(?:.*?\s+from\s+)?['"])(\.\/.+?)(['"];?\s*)$/gm,
        (match, pre, importPath, post) => {
          // importPath は componentRegistry で生成された srcDir からの相対パス
          const absImportTarget = path.resolve(componentsDir, importPath);
          let newRel = path.relative(outFileDir, absImportTarget).split(path.sep).join('/');
          if (!newRel.startsWith('.')) newRel = './' + newRel;
          return pre + newRel + post;
        }
      );
      // --optimize: 個別コンポーネントもミニファイ
      const outputCode = optimize ? minifyJS(adjustedOutput) : adjustedOutput;
      fs.writeFileSync(outPath, outputCode);

      // ソースマップファイルを出力（.js.map）— optimize 時はスキップ（ミニファイで行番号が変わるため）
      if (result.sourceMap && !optimize) {
        const mapName = outName + '.map';
        const mapPath = path.join(componentsDir, mapName);
        fs.mkdirSync(path.dirname(mapPath), { recursive: true });
        fs.writeFileSync(mapPath, JSON.stringify(result.sourceMap, null, 2));
      }

      const size = (Buffer.byteLength(outputCode) / 1024).toFixed(1);
      console.log(`  ${c.ok('✓')} → components/${outName} (${size} KB)`);

      // Bundle に追加するため、コンパイル済みソースコードを蓄積
      // （コメント区切り付き、sourceMappingURL除去）
      const bundleCode = result.output.replace(/\n\/\/# sourceMappingURL=.*$/, '');
      bundleParts.push(`// ── ${fileName} ──\n${bundleCode}`);

      // NEW-OPT: Collect all used helpers across components for shared extraction
      if (optimize && result.usedHelpers) {
        for (const helper of result.usedHelpers) {
          allUsedHelpers.add(helper);
        }
      }
      success++;
    } else {
      console.log(`  ${c.err('✗ Failed')}`);
      fail++;
    }
    console.log();
  }

  // Bundle ファイルを dist/ ルートに生成
  // （個別ファイルとは異なり、すべてのコンポーネントを1つにまとめたもの）
  if (bundleParts.length > 0) {
    // Extract import statements from all bundle parts and deduplicate.
    // バンドル内に含まれるコンポーネント同士の import はバンドルで自己完結するため除外。
    // 外部ライブラリへの import のみ残す。

    // バンドルに含まれるコンポーネントのファイル名を収集（ローカル import 判定用）
    const bundledFileNames = new Set();
    for (const file of files) {
      const bn = path.basename(file);
      const jsName = bn.replace(/\.csk$/, '.js');
      const tsName = bn.replace(/\.csk$/, '.ts');
      bundledFileNames.add(jsName);
      bundledFileNames.add(tsName);
      bundledFileNames.add('./' + jsName);
      bundledFileNames.add('./' + tsName);
    }

    const importSet = new Set();
    const cleanedParts = bundleParts.map(part => {
      const lines = part.split('\n');
      const nonImportLines = [];
      // import 文はファイル先頭（IIFE の前）にのみ存在する。
      // テンプレートリテラル内の "import" テキストを誤抽出しないよう、
      // 最初の非 import/非コメント/非空行に到達したらスキャンを終了する。
      let importScanDone = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!importScanDone && trimmed.startsWith('import ')) {
          // import 先がバンドル内のコンポーネントなら除外
          const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
          const sideEffectMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
          const importPath = fromMatch ? fromMatch[1] : sideEffectMatch ? sideEffectMatch[1] : null;
          if (importPath) {
            const importBase = path.basename(importPath);
            if (bundledFileNames.has(importPath) || bundledFileNames.has(importBase) || bundledFileNames.has('./' + importBase)) {
              // バンドル内コンポーネントへの import → 除外
              continue;
            }
          }
          importSet.add(trimmed);
        } else if (!importScanDone && (trimmed === '' || trimmed.startsWith('//'))) {
          // 空行やコメント行は import セクションの一部として許容
          nonImportLines.push(line);
        } else {
          importScanDone = true;
          nonImportLines.push(line);
        }
      }
      return nonImportLines.join('\n');
    });

    const hasImports = importSet.size > 0;
    const importBlock = hasImports ? Array.from(importSet).join('\n') + '\n\n' : '';

    const bundleHeader = `// Chasket Bundle - ${new Date().toISOString()}\n// ${bundleParts.length} component(s)\n${hasImports ? '// NOTE: This bundle uses ES imports — load with <script type="module">\n' : ''}\n`;
    // デferred registration queue の宣言と初期化
    // （各コンポーネントクラスがこのキューに push 〜 末尾で一括 define）
    const deferred = `// Deferred registration queue: all classes are defined first,\n// then all customElements.define() calls happen at the end.\n// This ensures nested components work regardless of file order.\nconst __chasketDefineQueue = [];\n\n`;
    // Bundle の末尾：キュー内のコンポーネントを依存順に customElements へ登録
    // 子コンポーネントを親より先に定義することで、親の connectedCallback 実行時に
    // 子の auto-upgrade が正しく動作する
    const bundleFooter = `
// Register components in dependency order (children before parents)
(function() {
  const tags = new Set(__chasketDefineQueue.map(([t]) => t));
  const tagIdx = new Map(__chasketDefineQueue.map(([t], i) => [t, i]));
  // Detect child custom elements from class source code
  const deps = __chasketDefineQueue.map(([tag, cls]) => {
    const src = cls.toString();
    const children = [];
    tags.forEach(t => { if (t !== tag && src.includes('<' + t)) children.push(t); });
    return children;
  });
  // Topological sort (Kahn's algorithm): children defined before parents
  const deg = deps.map(d => d.filter(t => tagIdx.has(t)).length);
  const q = []; deg.forEach((d, i) => { if (d === 0) q.push(i); });
  const order = [];
  while (q.length) {
    const i = q.shift(); order.push(i);
    const myTag = __chasketDefineQueue[i][0];
    deps.forEach((d, j) => { if (d.includes(myTag) && --deg[j] === 0) q.push(j); });
  }
  // Append any remaining (cyclic) in original order
  for (let i = 0; i < __chasketDefineQueue.length; i++) if (!order.includes(i)) order.push(i);
  order.forEach(i => {
    const [tag, cls] = __chasketDefineQueue[i];
    if (!customElements.get(tag)) customElements.define(tag, cls);
  });
})();
`;
    let bundleContent = bundleHeader + importBlock + deferred + cleanedParts.join('\n') + bundleFooter;
    const bundlePath = path.join(outDir, bundleName);

    // --optimize: バンドルのミニファイ
    if (optimize) {
      const originalSize = Buffer.byteLength(bundleContent);
      bundleContent = minifyJS(bundleContent);
      const minifiedSize = Buffer.byteLength(bundleContent);
      const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
      // ミニファイ済みバンドル名を .min.js で別途出力
      const minBundleName = bundleName.replace(/\.js$/, '.min.js');
      const minBundlePath = path.join(outDir, minBundleName);
      fs.writeFileSync(minBundlePath, bundleContent);
      const minSize = (minifiedSize / 1024).toFixed(1);
      console.log(`${c.ok('✓')} Optimized: ${c.b(minBundleName)} (${minSize} KB, -${savings}%)`);
    }

    // 非圧縮版を常に出力（デバッグ用）
    const rawContent = bundleHeader + importBlock + deferred + cleanedParts.join('\n') + bundleFooter;
    fs.writeFileSync(bundlePath, rawContent);

    if (hasImports) {
      console.log(`${c.warn('⚠')} バンドルに import 文が含まれています。<script type="module" src="${bundleName}"> で読み込んでください。`);
    }
    const bundleSize = (Buffer.byteLength(rawContent) / 1024).toFixed(1);
    console.log(`${c.info('▸')} Bundle: ${c.b(bundleName)} (${bundleSize} KB, ${bundleParts.length} components)`);
  }

  return { success, fail };
}

/**
 * Collect all .ts and .tsx files in a directory recursively.
 * Excludes node_modules and hidden directories.
 *
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of file paths
 */
function collectTsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip the components directory (handled by Chasket compiler)
      if (entry.name === 'components') continue;
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Simple TypeScript type stripping for browser-compatible output.
 *
 * Strips: type annotations, interfaces, type aliases, enums (declaration only),
 * generics, `as` casts, non-null assertions (!), and export type declarations.
 * Preserves: runtime code, import values, class/function/const bodies.
 *
 * This is NOT a full TypeScript compiler — for complex TS code use tsc or esbuild.
 *
 * @param {string} code - TypeScript source code
 * @returns {string} JavaScript-compatible output
 */
function stripTypes(code) {
  const lines = code.split('\n');
  const result = [];
  let skipBlock = false;
  let blockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip type-only imports: import type { ... } from '...'
    if (trimmed.match(/^import\s+type\s+/)) continue;
    // Skip interface declarations (potentially multi-line)
    if (trimmed.match(/^(export\s+)?interface\s+/)) {
      skipBlock = true;
      blockDepth = 0;
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') blockDepth++;
        if (line[j] === '}') blockDepth--;
      }
      if (blockDepth <= 0) skipBlock = false;
      continue;
    }
    // Skip type aliases: type X = ...
    if (trimmed.match(/^(export\s+)?type\s+\w+\s*[<=]/)) continue;
    // Skip enum declarations (multi-line)
    if (trimmed.match(/^(export\s+)?(const\s+)?enum\s+/)) {
      skipBlock = true;
      blockDepth = 0;
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') blockDepth++;
        if (line[j] === '}') blockDepth--;
      }
      if (blockDepth <= 0) skipBlock = false;
      continue;
    }

    if (skipBlock) {
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') blockDepth++;
        if (line[j] === '}') blockDepth--;
      }
      if (blockDepth <= 0) skipBlock = false;
      continue;
    }

    // Strip inline type annotations from the line
    let processed = line;
    // Remove type assertions: expr as Type
    processed = processed.replace(/\s+as\s+\w[\w<>\[\],\s|&]*(?=[,;\)\]\}]|$)/g, '');
    // Remove non-null assertions: expr!.prop -> expr.prop
    processed = processed.replace(/!(\.|[)\]])/g, '$1');
    // Remove function return type: ): Type { -> ) {
    processed = processed.replace(/\)\s*:\s*[\w<>\[\],\s|&?{}]+\s*(?=\{|=>)/g, ') ');
    // Remove parameter types: (name: Type) -> (name)
    processed = processed.replace(/(\w+)\s*:\s*[\w<>\[\],\s|&?{}]+(?=[,\)])/g, '$1');
    // Remove variable type annotations: const x: Type = -> const x =
    processed = processed.replace(/((?:const|let|var)\s+\w+)\s*:\s*[\w<>\[\],\s|&?{}]+\s*=/g, '$1 =');
    // Remove generic type parameters from function/class declarations
    processed = processed.replace(/((?:function|class)\s+\w+)<[^>]+>/g, '$1');
    // Strip import { type X, Y } -> import { Y }
    processed = processed.replace(/,\s*type\s+\w+/g, '');
    processed = processed.replace(/type\s+\w+\s*,\s*/g, '');
    // Remove .ts/.tsx extensions from imports
    processed = processed.replace(/(from\s+['"])([^'"]+)\.tsx?(['"])/g, '$1$2.js$3');

    result.push(processed);
  }
  return result.join('\n');
}

// ═══════════════════════════════════════════
// chasket check
// ═══════════════════════════════════════════

/**
 * 型チェックと診断を実行する（ファイル出力なし）
 *
 * 用途：
 * - CI/CD パイプラインでの構文・型チェック
 * - エディタ統合での on-save 検証
 * - 開発時の即座なエラー検出（実際のビルド前）
 *
 * 処理：
 * 1. ソースディレクトリ内のすべての .csk ファイルをコンパイル
 * 2. コンパイルは実行するが、出力ファイルは生成しない
 * 3. 診断情報（エラー/警告）を表示
 * 4. エラーが存在する場合、exit code 1 で終了
 *
 * P1-26b: Define target variable (was undefined before)
 * target 変数が定義されていなかったバグを修正
 *
 * @function cmdCheck
 * @returns {void}
 */
function cmdCheck() {
  const config = loadConfig();
  const srcDir = path.resolve(config.src || args[1] || 'src/components');
  // target 変数を定義してコンパイラに渡す
  const target = getArg('--target') || config.target || 'js';

  if (!fs.existsSync(srcDir)) {
    console.error(c.err(msg('CLI_BUILD_NO_SRC', {path: srcDir})));
    process.exit(1);
  }

  console.log(`\n${c.info('Chasket Check')}\n`);

  const files = collectChasketFiles(srcDir);
  let hasErrors = false;

  // 各ファイルのコンパイル結果を診断（ファイルは出力しない）
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    const fileName = path.basename(file);
    const result = compile(source, fileName, { target, shadow: config.shadow });

    if (result.diagnostics.length === 0) {
      console.log(`  ${c.ok('✓')} ${fileName}`);
    } else {
      // 診断情報を表示
      for (const d of result.diagnostics) {
        if (d.level === 'error') hasErrors = true;
        const icon = d.level === 'error' ? c.err('✗') : c.warn('⚠');
        console.log(`  ${icon} ${fileName}: [${d.code}] ${d.message}`);
        if (d.hint) console.log(`    ${c.d(`= hint: ${d.hint}`)}`);
      }
    }
  }

  console.log();
  // エラーが発見された場合は exit code 1 で終了（CI検証用）
  if (hasErrors) process.exit(1);
}

// ═══════════════════════════════════════════
// chasket dev
// ═══════════════════════════════════════════

/**
 * 開発サーバーを起動する（ホットモジュールリプレースメント対応）
 *
 * 機能：
 * 1. 初期ビルド：ソースディレクトリの .csk ファイルをコンパイル
 * 2. ファイル監視：.csk ファイルの変更を検知 → デバウンス付き自動リビルド
 * 3. HMR（ホットモジュールリプレースメント）：
 *    - 変更されたコンポーネントのみをリコンパイル
 *    - WebSocket経由で新しいコンポーネントコードをブラウザに送信
 *    - ブラウザ側でコンポーネントを再評価して再レンダリング
 *    - HMR失敗時は自動的にフルページリロードにフォールバック
 *    - --no-hmr フラグで無効化可能
 * 4. 静的ファイルサーバー：HTML、CSS、JS などを localhost:PORT で配信
 * 5. セキュリティ対策：
 *    - パストラバーサル攻撃防止
 *    - シンリンク解決と allowedRoots チェック
 *    - CORS / CSP ヘッダ設定
 *    - MIME タイプの適切な設定
 *
 * ## ファイル監視とデバウンス
 * ファイル変更イベントは頻繁に発火するため、150ms のデバウンスで
 * リビルド実行を制御 → 不要なコンパイル回数を削減
 *
 * ## HMR プロトコル
 * WebSocket メッセージ形式：
 * - HMR 更新: { type: 'hmr-update', component: 'x-counter', code: '...' }
 * - フルリロード: { type: 'reload' }
 *
 * @function cmdDev
 * @returns {void}
 */
function cmdDev() {
  const config = loadConfig();
  const srcDir = path.resolve(config.src || 'src/components');
  const outDir = path.resolve(config.outdir || 'dist');
  const htmlDir = path.resolve('src');
  // CLI引数からポート番号を取得（デフォルト 3000）
  // NEW-V8: ポート番号の範囲バリデーション
  const port = parseInt(getArg('--port') || '3000', 10);
  // HMR の有効/無効を判定（デフォルト：有効）
  const hmrEnabled = !args.includes('--no-hmr');
  // iframe 埋め込み許可フラグ（デフォルト：無効）
  // --allow-frames を指定すると CSP の frame-ancestors と script-src を緩和し、
  // iframe 内でコンポーネントを読み込めるようにする
  const allowFrames = args.includes('--allow-frames');

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`${c.red}エラー:${c.reset} 無効なポート番号です（1〜65535の範囲で指定してください）`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  banner();

  // 初期ビルド実行
  buildAll(srcDir, outDir);

  // HMR 用の WebSocket クライアントセット
  const wsClients = new Set();

  // ファイル監視開始
  // .csk ファイルの変更を検知して自動リビルド
  console.log(`${c.info('▸')} Watching ${srcDir} for changes...`);
  let debounce = null;
  fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.csk')) return;
    if (debounce) clearTimeout(debounce);
    // デバウンス：150ms 以内の連続変更は1回の再ビルドにまとめる
    debounce = setTimeout(() => {
      const filePath = path.join(srcDir, filename);
      console.log(`\n${c.info('▸')} ${filename} changed, recompiling...`);
      // P2-38: Wrap buildAll in try/catch to handle build failures gracefully
      // ビルド失敗がサーバーを停止させないよう、エラーハンドリングを実装
      try {
        if (hmrEnabled) {
          // HMR モード：変更ファイルのみを再コンパイル
          recompileFile(filePath, srcDir, outDir, wsClients);
        } else {
          // フルリビルド
          buildAll(srcDir, outDir);
          // HMR無効時はフルリロード送信
          broadcastReload(wsClients);
        }
      } catch (err) {
        console.error(c.err(`Build error: ${err.message}`));
        // エラー時はフルリロードにフォールバック
        broadcastReload(wsClients);
      }
    }, 150);
  });

  // 静的ファイルサーバー初期化
  // P2-36: Add MIME types for .ts, .jsx, .tsx, .wasm, .mjs
  // ファイル拡張子と MIME タイプのマッピング
  const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ts': 'text/typescript', '.jsx': 'text/jsx', '.tsx': 'text/tsx',
    '.wasm': 'application/wasm', '.mjs': 'text/javascript',
  };

  // HMR ランタイムスクリプト：ブラウザが実行するコード
  // Fine-grained HMR: コンポーネントレベルのホットリプレース
  // - __chasketClasses グローバルレジストリで新旧クラスを管理
  // - 状態の保存・復元でスムーズな更新体験を実現
  // - プロトタイプスワップにより customElements.define() の制約を回避
  const HMR_RUNTIME = `
(function() {
  // HMR クラスレジストリ: コンパイラ出力が新クラスをここに登録
  window.__chasketClasses = window.__chasketClasses || {};

  // Sandbox iframe 検出: sandbox="allow-scripts" のみの iframe は
  // opaque origin を持ち、parent frame アクセスで警告が出る。
  // この場合 HMR WebSocket は使わず、親からの postMessage でリロードする。
  var isSandboxed = false;
  try { isSandboxed = window.origin === 'null' || (window.parent !== window && document.domain === ''); } catch(e) { isSandboxed = true; }
  if (isSandboxed) {
    // sandbox iframe 用: 親フレームから postMessage('chasket:reload') を受け取ったらリロード
    window.addEventListener('message', function(e) {
      if (e.data === 'chasket:reload' || (e.data && e.data.type === 'chasket:reload')) {
        location.reload();
      }
    });
    console.log('[HMR] Sandbox iframe detected — using postMessage reload mode');
    return;
  }

  let socket = null;
  let connected = false;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + location.host;

  function connect() {
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      connected = true;
      console.log('[HMR] Connected');
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'hmr-update') {
          handleHMRUpdate(msg);
        } else if (msg.type === 'reload') {
          location.reload();
        }
      } catch (err) {
        console.error('[HMR] Message parse error:', err);
      }
    };
    socket.onerror = (err) => {
      console.error('[HMR] WebSocket error:', err);
    };
    socket.onclose = () => {
      connected = false;
      console.log('[HMR] Disconnected, reconnecting in 2s...');
      setTimeout(connect, 2000);
    };
  }

  /**
   * 状態を保存する。プライベートフィールドへはアクセスできないため、
   * __chasketState（コンパイラが生成する公開状態オブジェクト）を利用。
   * さらに属性値もバックアップする。
   */
  function saveState(el) {
    const state = {};
    // __chasketState が公開されている場合はそれを保存
    if (el.__chasketState && typeof el.__chasketState === 'object') {
      try {
        state.chasketState = JSON.parse(JSON.stringify(el.__chasketState));
      } catch (e) {
        // 循環参照等で保存できない場合はスキップ
      }
    }
    // 属性を保存
    state.attributes = {};
    for (const attr of el.attributes) {
      state.attributes[attr.name] = attr.value;
    }
    return state;
  }

  /**
   * 保存した状態を復元する
   */
  function restoreState(el, state) {
    if (!state) return;
    // __chasketState を復元
    if (state.chasketState && el.__chasketState) {
      try {
        Object.assign(el.__chasketState, state.chasketState);
      } catch (e) {
        // 復元失敗は無視
      }
    }
    // 属性を復元
    if (state.attributes) {
      for (const [name, value] of Object.entries(state.attributes)) {
        try { el.setAttribute(name, value); } catch (e) {}
      }
    }
  }

  function handleHMRUpdate(msg) {
    try {
      const { component, code } = msg;
      if (!component || !code) {
        console.error('[HMR] Invalid message format');
        return;
      }

      // DOM内のコンポーネント要素を事前に検索し、状態を保存
      const elements = document.querySelectorAll(component);
      const savedStates = new Map();
      for (const el of elements) {
        savedStates.set(el, saveState(el));
      }

      // 新しいコンポーネントコードを実行
      // セキュリティ: eval() の代わりに Blob URL + <script> で実行
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;

      script.onload = () => {
        URL.revokeObjectURL(url);

        // __chasketClasses から新しいクラスを取得
        const NewClass = window.__chasketClasses[component];
        if (!NewClass) {
          console.warn('[HMR] New class not found for', component, '- falling back to reload');
          location.reload();
          return;
        }

        if (elements.length === 0) {
          console.log('[HMR] No elements found for', component, '(class registered for future use)');
          return;
        }

        console.log('[HMR] Updating', component, ':', elements.length, 'instance(s)');

        // 各要素を更新
        let updateSuccess = true;
        for (const el of elements) {
          try {
            const state = savedStates.get(el);

            // プロトタイプを新しいクラスに差し替え
            // これにより既存インスタンスのメソッド（#update, イベントハンドラ等）が
            // 新しい実装に切り替わる
            Object.setPrototypeOf(el, NewClass.prototype);

            // Shadow DOM をクリアして再レンダリング
            if (el.shadowRoot) {
              el.shadowRoot.innerHTML = '';
            }

            // connectedCallback を再実行（テンプレート・スタイル・イベントの再構築）
            if (typeof el.connectedCallback === 'function') {
              el.connectedCallback();
            }

            // 状態を復元して再描画
            restoreState(el, state);

            // 復元後に #update() を呼んで最新状態を DOM に反映
            if (typeof el.update === 'function') {
              el.update();
            } else if (el.__chasketState && typeof el.connectedCallback === 'function') {
              // __chasketState 復元後は connectedCallback で再描画済みだが、
              // 状態復元分は手動トリガーが必要な場合がある
              // プライベートメソッド #update はプロトタイプ経由で呼べないため、
              // 属性変更で間接的にトリガー
              try {
                const tempAttr = '__hmr_refresh_' + Date.now();
                el.setAttribute(tempAttr, '1');
                el.removeAttribute(tempAttr);
              } catch (e) {}
            }
          } catch (err) {
            console.error('[HMR] Failed to update element:', err);
            updateSuccess = false;
          }
        }

        if (updateSuccess) {
          console.log('[HMR] ✓ Successfully updated', component);
        } else {
          console.warn('[HMR] Some updates failed for', component, '- try full reload');
          location.reload();
        }
      };

      script.onerror = () => {
        URL.revokeObjectURL(url);
        console.error('[HMR] Failed to load component code, falling back to reload');
        location.reload();
      };

      document.head.appendChild(script);
    } catch (err) {
      console.error('[HMR] Update handler error:', err);
      location.reload();
    }
  }

  // 接続開始
  connect();

  // 親ページ用: HMR 更新時に sandbox iframe にも postMessage でリロード通知を送る
  var _origHandleHMR = handleHMRUpdate;
  handleHMRUpdate = function(msg) {
    _origHandleHMR(msg);
    // すべての iframe に chasket:reload を通知
    try {
      var frames = document.querySelectorAll('iframe[sandbox]');
      for (var i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage('chasket:reload', '*'); } catch(e) {}
      }
    } catch(e) {}
  };
})();
`;

  const server = http.createServer((req, res) => {
    // URL の正規化：ルート "/" は index.html にマップ
    let url = req.url === '/' ? '/index.html' : req.url;
    // クエリ文字列を削除
    url = url.split('?')[0];

    // セキュリティ：パストトラバーサル攻撃対策
    // 多重エンコード攻撃（%252e%252e 等）対策: デコードを繰り返し実行
    let prevUrl;
    do {
      prevUrl = url;
      try { url = decodeURIComponent(url); } catch(e) { break; }
    } while (url !== prevUrl);
    // ".." または null 文字を検出 → 403 Forbidden を返却
    if (url.includes('\0') || /\.\./.test(url)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    // セキュリティ：許可されたルートディレクトリを定義
    // この範囲外のファイルは提供しない
    const allowedRoots = [path.resolve(htmlDir), path.resolve(outDir), path.resolve(process.cwd())];

    // セキュリティ：複数の場所からファイルを探す（優先順）
    // 1. HTML ディレクトリ（通常は src/）
    // 2. ビルド出力ディレクトリ（dist/）
    // 3. カレントワーキングディレクトリ
    const candidates = [
      path.join(htmlDir, url),
      path.join(outDir, url.replace(/^\/dist\//, '')),
      path.join(process.cwd(), url),
    ];

    // /dist/* パスの特殊処理（ビルド出力をルートの dist/ で配信）
    if (url.startsWith('/dist/')) {
      candidates.unshift(path.join(outDir, url.replace('/dist/', '')));
    }

    // 各候補パスを順番にチェック
    for (const filePath of candidates) {
      const resolved = path.resolve(filePath);

      // S-22: Symlink TOCTOU防止
      // ファイルを開く際に O_NOFOLLOW フラグを使用して symlink を無視
      // または、realpath を呼ぶ前にファイルを開いて、open後に inode を検証
      // Node.js では fs.openSync に O_NOFOLLOW が直接サポートされないため、
      // try-catch で fs.statSync(path, {bigint: false}) の symlink チェックを実施

      let realPath = resolved;
      let linkedPath = null;

      try {
        // ファイルが symlink でないかを確認：lstat で symlink 自体をチェック
        const lstat = fs.lstatSync(resolved);
        if (lstat.isSymbolicLink()) {
          // symlink が検出された場合、realpath で解決
          linkedPath = resolved;
          realPath = fs.realpathSync(resolved);
        } else if (!lstat.isFile()) {
          // symlink ではなく、ファイルでもない場合はスキップ
          continue;
        }
      } catch (e) {
        // ファイルが存在しない場合は resolved パスのまま続行
      }

      // 実パスが allowedRoots の範囲内にあることを確認
      if (!allowedRoots.some(root => realPath.startsWith(root + path.sep) || realPath === root)) continue;

      // ファイルが存在し、かつファイルであることを確認
      // 本当に開く直前に確認することで TOCTOU リスクを最小化
      if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
        const ext = path.extname(realPath);
        const mime = MIME[ext] || 'application/octet-stream';
        // P2-34: Add CORS header
        // P2-35: Add CSP header for dev mode
        // セキュリティヘッダの設定
        // HTML ファイルの場合、HMR ランタイムを nonce 付きで注入
        if (ext === '.html' && hmrEnabled) {
          // セキュリティ: リクエストごとに一意の nonce を生成（CSP インラインスクリプト許可用）
          const nonce = crypto.randomBytes(16).toString('base64');
          res.writeHead(200, {
            'Content-Type': mime + '; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            // sandbox iframe（allow-scripts only）は Origin: null を送るため CORS で * が必要
            'Access-Control-Allow-Origin': allowFrames ? '*' : 'http://localhost:' + port,
            // セキュリティ: unsafe-inline は使わず nonce のみでインラインスクリプトを許可（XSS 防御を維持）
            // --allow-frames 時の注意:
            //   sandbox="allow-scripts" のみの iframe はオパークオリジン（null）を持つため
            //   'self' がマッチしない。そのため明示的にサーバーURLを script-src/style-src/default-src に追加。
            //   frame-ancestors で埋め込み元を制限し、connect-src で WebSocket 先を限定。
            'Content-Security-Policy': allowFrames
              ? `default-src 'self' http://localhost:${port} http://127.0.0.1:${port}; style-src 'self' http://localhost:${port} http://127.0.0.1:${port} 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' http://localhost:${port} http://127.0.0.1:${port} blob: 'nonce-${nonce}'; frame-ancestors 'self' http://localhost:${port} http://127.0.0.1:${port}; connect-src 'self' http://localhost:${port} http://127.0.0.1:${port} ws://localhost:${port} ws://127.0.0.1:${port}; img-src 'self' http://localhost:${port} http://127.0.0.1:${port} data:; font-src 'self' http://localhost:${port} http://127.0.0.1:${port} https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; object-src 'none'`
              : `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' blob: 'nonce-${nonce}'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; base-uri 'self'; form-action 'self'; object-src 'none'`,
          });

          const htmlContent = fs.readFileSync(realPath, 'utf-8');
          // </head> または </body> の直前に HMR スクリプトを nonce 付きで注入
          let injected = htmlContent.replace(
            '</head>',
            `<script nonce="${nonce}">${HMR_RUNTIME}</script>\n</head>`
          );
          // </head> がない場合は </body> の直前に注入
          if (injected === htmlContent) {
            injected = htmlContent.replace(
              '</body>',
              `<script nonce="${nonce}">${HMR_RUNTIME}</script>\n</body>`
            );
          }
          // それでもない場合は末尾に追加
          if (injected === htmlContent) {
            injected += `\n<script nonce="${nonce}">${HMR_RUNTIME}</script>`;
          }
          res.end(injected);
          return;
        }

        res.writeHead(200, {
          'Content-Type': mime + '; charset=utf-8',
          'Cache-Control': 'no-cache',  // 開発中はキャッシュさせない
          'X-Content-Type-Options': 'nosniff',  // MIME スニッフィング防止
          'Access-Control-Allow-Origin': allowFrames ? '*' : 'http://localhost:' + port,
          // 非HTML（JS/CSS等）にも同様のポリシー適用
          // SEC-03: blob: は HMR 有効時のみ許可（動的スクリプト評価に必要）
          'Content-Security-Policy': allowFrames
            ? `default-src 'self' http://localhost:${port} http://127.0.0.1:${port}; style-src 'self' http://localhost:${port} http://127.0.0.1:${port} 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' http://localhost:${port} http://127.0.0.1:${port}${hmrEnabled ? ' blob:' : ''}; frame-ancestors 'self' http://localhost:${port} http://127.0.0.1:${port}; font-src 'self' http://localhost:${port} http://127.0.0.1:${port} https://fonts.gstatic.com; img-src 'self' http://localhost:${port} http://127.0.0.1:${port} data:; base-uri 'self'; form-action 'self'; object-src 'none'`
            : `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'${hmrEnabled ? ' blob:' : ''}; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; base-uri 'self'; form-action 'self'; object-src 'none'`,
        });

        // ファイルをストリーム形式で送信（大きなファイルでもメモリ効率的）
        fs.createReadStream(realPath).pipe(res);
        return;
      }
    }

    // どの候補にもマッチしない → 404 Not Found を返却
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  });

  // WebSocket アップグレードハンドラー（HMR用）
  if (hmrEnabled) {
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/') {
        // セキュリティ: Origin ヘッダ検証（クロスオリジン WebSocket ハイジャック防止）
        const origin = req.headers['origin'];
        const allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
        // --allow-frames 時は null origin も許可（sandbox iframe は Origin: null を送信するため）
        if (allowFrames && origin === 'null') { /* allow */ }
        else if (origin && !allowedOrigins.includes(origin)) {
          console.warn(`[HMR] Rejected WebSocket from unauthorized origin: ${origin}`);
          socket.destroy();
          return;
        }

        // セキュリティ: Sec-WebSocket-Key フォーマット検証 (RFC 6455)
        const key = req.headers['sec-websocket-key'];
        if (!key || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
          console.warn('[HMR] Rejected WebSocket: invalid Sec-WebSocket-Key');
          socket.destroy();
          return;
        }

        // WebSocket ハンドシェイク処理
        const hash = crypto
          .createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: ' + hash + '\r\n' +
          '\r\n'
        );

        // WebSocket コネクションをクライアントセットに追加
        wsClients.add(socket);
        socket.on('close', () => {
          wsClients.delete(socket);
        });
        socket.on('error', () => {
          wsClients.delete(socket);
        });
      } else {
        socket.destroy();
      }
    });
  }

  // P2-37: Add error handler for port conflicts
  // ポート使用中エラーを処理して、分かりやすいエラーメッセージを表示
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(c.err(`ポート ${port} は既に使用されています。別のポートを指定してください:`));
      console.error(c.err(`  chasket dev --port ${port + 1}`));
      process.exit(1);
    } else {
      throw err;
    }
  });

  // セキュリティ: 127.0.0.1 にバインドし、外部ネットワークからの接続を拒否
  server.listen(port, '127.0.0.1', () => {
    if (hmrEnabled) {
      console.log(`${c.ok('▸')} Dev server: ${c.b(`http://localhost:${port}`)} ${c.d('(HMR enabled)')}`);
    } else {
      console.log(`${c.ok('▸')} Dev server: ${c.b(`http://localhost:${port}`)} ${c.d('(HMR disabled)')}`);
    }
    console.log(`${c.d('  Ctrl+C to stop')}\n`);
  });
}

// ─── HMR helpers ───

/**
 * WebSocket クライアントにメッセージをブロードキャストする
 *
 * @param {Set<Socket>} clients - WebSocket クライアントセット
 * @param {Object} msg - 送信するメッセージ
 * @returns {void}
 */
function broadcastMessage(clients, msg) {
  const data = JSON.stringify(msg);
  // WebSocket フレームを作成（バイナリ小）
  const payload = Buffer.from(data);
  const frame = encodeWebSocketFrame(payload);
  for (const client of clients) {
    try {
      client.write(frame);
    } catch (err) {
      // クライアントへの送信失敗は無視
    }
  }
}

/**
 * フルページリロード指令をブロードキャスト
 *
 * @param {Set<Socket>} clients - WebSocket クライアントセット
 * @returns {void}
 */
function broadcastReload(clients) {
  broadcastMessage(clients, { type: 'reload' });
}

/**
 * HMR 更新メッセージをブロードキャスト
 *
 * @param {Set<Socket>} clients - WebSocket クライアントセット
 * @param {string} component - コンポーネント名（タグ名）
 * @param {string} code - コンポーネントのコード
 * @returns {void}
 */
function broadcastHMRUpdate(clients, component, code) {
  broadcastMessage(clients, {
    type: 'hmr-update',
    component,
    code,
  });
}

/**
 * シンプルな WebSocket フレームエンコーディング
 * RFC 6455 に準拠した最小限の実装
 *
 * @param {Buffer} payload - ペイロード
 * @returns {Buffer} エンコードされたフレーム
 */
function encodeWebSocketFrame(payload) {
  let header;
  const len = payload.length;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * 単一ファイルを再コンパイルして HMR で配信
 *
 * @param {string} filePath - 変更されたファイルパス
 * @param {string} srcDir - ソースディレクトリ
 * @param {string} outDir - 出力ディレクトリ
 * @param {Set<Socket>} wsClients - WebSocket クライアントセット
 * @returns {void}
 */
function recompileFile(filePath, srcDir, outDir, wsClients) {
  const config = loadConfig();
  const fileName = path.basename(filePath);

  // ファイルが存在するかチェック
  if (!fs.existsSync(filePath)) {
    console.log(`  ${c.warn('⚠')} File deleted, falling back to full rebuild`);
    buildAll(srcDir, outDir);
    broadcastReload(wsClients);
    return;
  }

  // ファイルをコンパイル
  const source = fs.readFileSync(filePath, 'utf-8');
  const result = compile(source, fileName);

  if (!result.success) {
    // コンパイルエラー時はフルリロード
    console.log(`  ${c.err('✗')} Compilation failed, requesting full reload`);
    for (const d of result.diagnostics) {
      const icon = d.level === 'error' ? c.err('✗') : c.warn('⚠');
      console.log(`    ${icon} ${d.message}`);
    }
    broadcastReload(wsClients);
    return;
  }

  // メタデータからコンポーネント名を抽出
  let componentName = null;
  const metaMatch = source.match(/<meta>([\s\S]*?)<\/meta>/);
  if (metaMatch) {
    const metaContent = metaMatch[1];
    const nameMatch = metaContent.match(/name:\s*"([^"]+)"/);
    if (nameMatch) {
      componentName = nameMatch[1];
    }
  }

  if (!componentName) {
    console.log(`  ${c.warn('⚠')} Could not determine component name, falling back to full rebuild`);
    buildAll(srcDir, outDir);
    broadcastReload(wsClients);
    return;
  }

  // 個別ファイルを components/ に出力
  const componentsDir = path.join(outDir, 'components');
  fs.mkdirSync(componentsDir, { recursive: true });
  const outName = fileName.replace('.csk', '.js');
  const outPath = path.join(componentsDir, outName);
  fs.writeFileSync(outPath, result.output);

  // ソースマップも出力
  if (result.sourceMap) {
    const mapPath = path.join(componentsDir, outName + '.map');
    fs.writeFileSync(mapPath, JSON.stringify(result.sourceMap, null, 2));
  }

  // バンドルも更新（他のコンポーネントが参照する可能性）
  updateBundle(srcDir, outDir);

  const size = (Buffer.byteLength(result.output) / 1024).toFixed(1);
  console.log(`  ${c.ok('✓')} → components/${outName} (${size} KB)`);

  // HMR で更新を送信
  broadcastHMRUpdate(wsClients, componentName, result.output);
  console.log(`  ${c.ok('✓')} Sent HMR update for ${c.b(componentName)}`);
}

/**
 * バンドルファイルを更新（全コンポーネントを再集約）
 *
 * @param {string} srcDir - ソースディレクトリ
 * @param {string} outDir - 出力ディレクトリ
 * @returns {void}
 */
function updateBundle(srcDir, outDir) {
  const config = loadConfig();
  const bundleName = config.bundle || 'chasket-bundle.js';
  const componentsDir = path.join(outDir, 'components');

  // components/ から全 .js ファイルを読み込み
  const bundleParts = [];
  if (fs.existsSync(componentsDir)) {
    const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.js') && !f.endsWith('.map'));
    for (const file of files) {
      const code = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
      bundleParts.push(`// ── ${file} ──\n${code}`);
    }
  }

  // バンドルを生成
  if (bundleParts.length > 0) {
    const bundleHeader = `// Chasket Bundle - ${new Date().toISOString()}\n// ${bundleParts.length} component(s)\n\n`;
    const hmrRegistry = `// HMR class registry (dev mode)\nif (typeof window !== 'undefined') window.__chasketClasses = window.__chasketClasses || {};\n\n`;
    const deferred = `const __chasketDefineQueue = [];\n\n`;
    const bundleFooter = `\n__chasketDefineQueue.forEach(([tag, cls]) => {\n  if (!customElements.get(tag)) customElements.define(tag, cls);\n});\n`;
    const bundleContent = bundleHeader + hmrRegistry + deferred + bundleParts.join('\n') + bundleFooter;
    fs.writeFileSync(path.join(outDir, bundleName), bundleContent);
  }
}

// ─── Build helper ───

/**
 * 開発モード用の高速ビルルパー関数
 *
 * cmdDev() の ファイル監視コールバックや初期ビルドから呼ばれる
 * 静粛なコンパイル処理を実装：
 * - 個別ファイルを components/ に出力
 * - Bundle を dist/ ルートに生成
 * - ビルド失敗時も、エラーメッセージを表示して処理を続行
 *   （サーバーは停止させない）
 *
 * 実装上の注意：
 * - cmdBuild() と異なり、詳細な診断情報は表示しない（開発用）
 * - デバウンス内から呼ばれるため、処理は高速化されている
 * - バンドルは常に生成される（ファイル数=0 でない限り）
 *
 * @function buildAll
 * @param {string} srcDir - ソースディレクトリパス
 * @param {string} outDir - 出力先ディレクトリパス
 * @returns {void}
 */
function buildAll(srcDir, outDir) {
  const config = loadConfig();
  const bundleName = config.bundle || 'chasket-bundle.js';
  const componentsDir = path.join(outDir, 'components');
  fs.mkdirSync(componentsDir, { recursive: true });
  // ソースから .csk ファイルを探索
  const files = collectChasketFiles(srcDir);
  let success = 0, fail = 0;
  const bundleParts = [];

  // 各ファイルをコンパイル
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    const fileName = path.basename(file);
    // コンパイラ実行（target 指定なし = デフォルト JS）
    const result = compile(source, fileName, { shadow: config.shadow });

    if (result.success) {
      // 個別ファイルを components/ に出力
      const outName = fileName.replace('.csk', '.js');
      const outPath = path.join(componentsDir, outName);
      fs.writeFileSync(outPath, result.output);

      // ソースマップファイルを出力（.js.map）
      if (result.sourceMap) {
        const mapPath = path.join(componentsDir, outName + '.map');
        fs.writeFileSync(mapPath, JSON.stringify(result.sourceMap, null, 2));
      }

      // バンドル用に蓄積（sourceMappingURL除去）
      const bundleCode = result.output.replace(/\n\/\/# sourceMappingURL=.*$/, '');
      bundleParts.push(`// ── ${fileName} ──\n${bundleCode}`);
      success++;
    } else {
      fail++;
      // エラーメッセージを表示（簡潔なフォーマット）
      for (const d of result.diagnostics) {
        const icon = d.level === 'error' ? c.err('✗') : c.warn('⚠');
        console.log(`  ${icon} ${fileName}: ${d.message}`);
      }
    }
  }

  // Bundle ファイルを生成
  // （cmd を問わず、buildAll 呼び出し時は必ず生成）
  if (bundleParts.length > 0) {
    const bundleHeader = `// Chasket Bundle - ${new Date().toISOString()}\n// ${bundleParts.length} component(s)\n\n`;
    // P2-40: Add comment warning if ESM format is requested (not yet fully supported)
    // ESM 形式の警告（ESM サポートは将来予定）
    let esmWarning = '';
    if (config.format === 'esm') {
      esmWarning = `// WARNING: ESM format requested but bundler is script-tag only.\n// ESM support coming in a future version.\n`;
    }
    // HMR class registry (dev mode)
    const hmrRegistry = `if (typeof window !== 'undefined') window.__chasketClasses = window.__chasketClasses || {};\n\n`;
    // デferred registration queue の初期化
    const deferred = `const __chasketDefineQueue = [];\n\n`;
    // 全コンポーネントを一括登録
    const bundleFooter = `\n__chasketDefineQueue.forEach(([tag, cls]) => {\n  if (!customElements.get(tag)) customElements.define(tag, cls);\n});\n`;
    fs.writeFileSync(path.join(outDir, bundleName), bundleHeader + esmWarning + hmrRegistry + deferred + bundleParts.join('\n') + bundleFooter);
  }

  // コンパイル結果をコンソール表示
  if (fail === 0) {
    console.log(`  ${c.ok('✓')} ${success} file${success !== 1 ? 's' : ''} compiled → ${bundleName}`);
  } else {
    console.log(`  ${c.warn(`${fail} error(s)`)}, ${success} compiled`);
  }
}

// ─── Config ───

/**
 * chasket.config.json からプロジェクト設定を読み込む
 *
 * ## 設定ファイル形式
 * ```json
 * {
 *   "target": "js",              // 出力形式：js または ts
 *   "outdir": "dist",            // ビルド出力先ディレクトリ
 *   "bundle": "chasket-bundle.js", // バンドルファイル名
 *   "shadow": "open",            // Shadow DOM モード
 *   "sourcemap": false,          // ソースマップ生成
 *   "minify": false,             // コード最小化
 *   "src": "src/components",     // ソースディレクトリ
 *   "format": "esm"              // モジュール形式（ESM は開発中）
 * }
 * ```
 *
 * ## エラーハンドリング
 * - ファイルが存在しない場合 → 空オブジェクト {} を返す（デフォルト値使用）
 * - JSON パース失敗 → 警告を表示し、空オブジェクト {} を返す（デフォルト値使用）
 * - P2-39: Log warning when JSON parse fails instead of silently returning {}
 *   パース失敗時に警告を出力することで、デバッグを容易にする
 *
 * @function loadConfig
 * @returns {Object} パースされた設定オブジェクト。ファイルが存在しない場合や
 *                   パース失敗時は空オブジェクト。
 */
function loadConfig() {
  // --config フラグで任意の設定ファイルを指定可能
  const configArg = getArg('--config');
  const configPath = path.resolve(configArg || 'chasket.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    // P2-39: Log warning when JSON parse fails instead of silently returning {}
    // JSON パース失敗時に警告メッセージを出力
    catch (e) {
      console.warn(c.warn(msg('CLI_CONFIG_PARSE_ERROR', {error: e.message})));
      return {};
    }
  }
  if (configArg) {
    console.error(c.err(`Config file not found: ${configPath}`));
    process.exit(1);
  }
  return {};
}

// ─── Utilities ───

/**
 * ディレクトリ内のすべての .csk ファイルを再帰的に探索する
 *
 * 用途：
 * - プロジェクト内の全コンポーネントファイルを一括取得
 * - buildAll(), cmdBuild(), cmdCheck() から呼ばれる
 *
 * 処理フロー：
 * 1. 指定パスを絶対パスに解決
 * 2. パスが存在しない場合 → 空配列を返す
 * 3. ファイルであり、かつ .csk で終わる場合 → そのファイルのみを配列で返す
 * 4. ディレクトリの場合 → 再帰的にすべての .csk ファイルを探す
 *
 * 例：
 * ```
 * src/components/
 *   ├── app.csk
 *   ├── header/
 *   │   └── header.csk
 *   └── footer/
 *       └── footer.csk
 * ```
 * → ['/path/to/app.csk', '/path/to/header/header.csk', '/path/to/footer/footer.csk']
 *
 * @function collectChasketFiles
 * @param {string} dir - 探索対象のディレクトリパス（ファイルの場合はそのファイルのみ対象）
 * @returns {string[]} 見つかった .csk ファイルのパスの配列
 */
function collectChasketFiles(dir) {
  const p = path.resolve(dir);
  // パスが存在しない場合は空配列を返す
  if (!fs.existsSync(p)) return [];
  // ファイルであり、.csk で終わる場合 → そのファイルのみを返す
  if (fs.statSync(p).isFile() && dir.endsWith('.csk')) return [p];
  // ファイルだが .csk でない場合 → 空配列を返す
  if (!fs.statSync(p).isDirectory()) return [];

  const files = [];
  // 手動再帰走査（Node 18.17 未満では readdirSync の recursive オプションが未対応のため）
  function walk(d) {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && full.endsWith('.csk')) {
          files.push(full);
        }
      } catch (_) { /* permission denied etc. */ }
    }
  }
  walk(p);
  return files;
}

/**
 * CLI 引数から指定されたオプションの値を取得する
 *
 * 用法：
 * ```
 * chasket build --outdir my-dist --target ts
 * getArg('--outdir')  // 'my-dist'
 * getArg('--target')  // 'ts'
 * getArg('--port')    // null（指定なし）
 * ```
 *
 * 処理：
 * - args 配列（process.argv.slice(2)）から指定名を探す
 * - 見つかった場合、その直後の要素を値として返す
 * - 見つからない、または値がない場合は null を返す
 *
 * @function getArg
 * @param {string} name - 探すオプション名（例：'--outdir'、'--port'）
 * @returns {string|null} オプションの値、または null
 */
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

// ═══════════════════════════════════════════
// Dispatch
// ═══════════════════════════════════════════

/**
 * CLI コマンドディスパッチャー
 *
 * process.argv[2] で指定されたコマンドを解析して、対応する関数を実行
 *
 * サポートコマンド：
 * - init    → cmdInit()    新規プロジェクト初期化
 * - build   → cmdBuild()   本番ビルド
 * - dev     → cmdDev()     開発サーバー起動
 * - check   → cmdCheck()   型チェック
 * - --version / -v        バージョン表示
 * - --help / -h / (空)    ヘルプ表示
 */
switch (cmd) {
  case 'init': cmdInit(); break;
  case 'build': cmdBuild(); break;
  case 'dev': cmdDev(); break;
  case 'check': cmdCheck(); break;
  case '--version': case '-v': console.log(`chasket ${VERSION}`); break;
  case '--help': case '-h': case undefined: printHelp(); break;
  default: console.error(c.err(`Unknown command: ${cmd}`)); printHelp(); process.exit(1);
}

/**
 * CLI ヘルプメッセージを表示する
 *
 * 以下の場合に呼ばれる：
 * - chasket -h / --help を実行
 * - chasket を引数なしで実行
 * - unknown command が指定された
 *
 * 表示内容：
 * - 使用方法（Usage）
 * - 利用可能なコマンド
 * - グローバルオプション
 *
 * @function printHelp
 * @returns {void}
 */
function printHelp() {
  console.log(`
${c.b('Chasket')} v${VERSION} - Web Component コンパイラ

${c.b('Usage:')}
  chasket init <name>        新規プロジェクト作成
  chasket dev                開発サーバー起動 (HMR有効)
  chasket build              本番ビルド
  chasket check              型チェックのみ

${c.b('Options:')}
  --target js|ts           出力フォーマット (default: js)
  --outdir <dir>           出力先ディレクトリ (default: dist)
  --config <file>          設定ファイル指定 (default: chasket.config.json)
  --port <number>          dev server ポート (default: 3000)
  --optimize true|false    バンドルサイズ最適化 (デッドコード削除)
  --no-hmr                 HMR を無効化し、フルページリロードを使用
  --allow-frames           iframe 埋め込みを許可 (CSP を緩和)
  -v, --version            バージョン表示
  -h, --help               ヘルプ表示

${c.b('HMR (ホットモジュールリプレースメント):')}
  dev コマンド実行時にデフォルトで有効。.csk ファイル変更時に
  変更されたコンポーネントのみを更新し、ページのリロードなしで
  ブラウザに反映されます。--no-hmr で従来のフルリロードに戻します。
`);
}
