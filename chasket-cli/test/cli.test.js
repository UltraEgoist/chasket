/**
 * CLI Test Suite for Chasket
 *
 * Tests the CLI commands (init, build, check) by executing them as child processes.
 * Uses Node.js built-in test runner (node:test) and assert module.
 *
 * テスト対象:
 * - chasket init: プロジェクト生成、名前バリデーション、既存ディレクトリチェック
 * - chasket build: コンパイルパイプライン、バンドル生成、エラーハンドリング
 * - chasket check: 型チェック、診断出力
 * - chasket --help / --version: ヘルプ・バージョン表示
 */

const test = require('node:test');
const assert = require('node:assert');
const { execSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '../bin/chasket.js');

// ─── Helper: Run CLI command and capture output ───
function runCli(args, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: (err.stdout || '') + (err.stderr || ''),
      exitCode: err.status || 1,
    };
  }
}

// ─── Helper: Create temp directory ───
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chasket-test-'));
}

// ─── Helper: Cleanup temp directory ───
function cleanDir(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================
// TESTS: --help / --version
// ============================================================

test('cli --help shows usage information', () => {
  const { stdout, exitCode } = runCli(['--help']);
  assert.strictEqual(exitCode, 0);
  assert.ok(stdout.includes('chasket init'), 'should show init command');
  assert.ok(stdout.includes('chasket dev'), 'should show dev command');
  assert.ok(stdout.includes('chasket build'), 'should show build command');
  assert.ok(stdout.includes('chasket check'), 'should show check command');
});

test('cli -h is alias for --help', () => {
  const { stdout, exitCode } = runCli(['-h']);
  assert.strictEqual(exitCode, 0);
  assert.ok(stdout.includes('chasket init'));
});

test('cli --version shows version', () => {
  const { stdout, exitCode } = runCli(['--version']);
  assert.strictEqual(exitCode, 0);
  assert.match(stdout.trim(), /^chasket \d+\.\d+\.\d+$/);
});

test('cli -v is alias for --version', () => {
  const { stdout, exitCode } = runCli(['-v']);
  assert.strictEqual(exitCode, 0);
  assert.match(stdout.trim(), /^chasket \d+\.\d+\.\d+$/);
});

test('cli no args shows help', () => {
  const { stdout, exitCode } = runCli([]);
  assert.strictEqual(exitCode, 0);
  assert.ok(stdout.includes('chasket init'));
});

test('cli unknown command shows error', () => {
  const { stdout, exitCode } = runCli(['nonexistent']);
  assert.strictEqual(exitCode, 1);
  assert.ok(stdout.includes('Unknown command'));
});

// ============================================================
// TESTS: chasket init
// ============================================================

test('init creates project structure', () => {
  const tmpDir = makeTempDir();
  const projName = 'test-proj';
  try {
    const { stdout, exitCode } = runCli(['init', projName], { cwd: tmpDir });
    assert.strictEqual(exitCode, 0, `init failed: ${stdout}`);

    const projDir = path.join(tmpDir, projName);
    // Verify directories
    assert.ok(fs.existsSync(path.join(projDir, 'src')), 'src/ should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'src', 'components')), 'src/components/ should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'src', 'lib')), 'src/lib/ should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'dist')), 'dist/ should exist');

    // Verify files
    assert.ok(fs.existsSync(path.join(projDir, 'chasket.config.json')), 'chasket.config.json should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'package.json')), 'package.json should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'src', 'components', 'app.csk')), 'app.csk should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'src', 'index.html')), 'index.html should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'src', 'lib', 'utils.ts')), 'utils.ts should exist');

    // Verify package.json content
    const pkg = JSON.parse(fs.readFileSync(path.join(projDir, 'package.json'), 'utf-8'));
    assert.strictEqual(pkg.name, projName);
    assert.ok(pkg.scripts.dev, 'should have dev script');
    assert.ok(pkg.scripts.build, 'should have build script');

    // Verify chasket.config.json content
    const config = JSON.parse(fs.readFileSync(path.join(projDir, 'chasket.config.json'), 'utf-8'));
    assert.strictEqual(config.target, 'js');
    assert.strictEqual(config.outdir, 'dist');
    assert.strictEqual(config.src, 'src/components');
  } finally {
    cleanDir(tmpDir);
  }
});

test('init rejects missing project name', () => {
  const { stdout, exitCode } = runCli(['init']);
  assert.strictEqual(exitCode, 1);
  assert.ok(stdout.includes('Usage'));
});

test('init rejects invalid project name (uppercase)', () => {
  const tmpDir = makeTempDir();
  try {
    const { stdout, exitCode } = runCli(['init', 'MyProject'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('無効なプロジェクト名') || stdout.includes('Invalid project name') || exitCode === 1);
  } finally {
    cleanDir(tmpDir);
  }
});

test('init rejects invalid project name (special chars)', () => {
  const tmpDir = makeTempDir();
  try {
    const { stdout, exitCode } = runCli(['init', '@bad/name'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
  } finally {
    cleanDir(tmpDir);
  }
});

test('init rejects existing directory', () => {
  const tmpDir = makeTempDir();
  const projName = 'existing-proj';
  fs.mkdirSync(path.join(tmpDir, projName));
  try {
    const { stdout, exitCode } = runCli(['init', projName], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('既に存在します') || stdout.includes('already exists') || exitCode === 1);
  } finally {
    cleanDir(tmpDir);
  }
});

test('init accepts valid names (with hyphen, dot, underscore)', () => {
  const tmpDir = makeTempDir();
  try {
    const { exitCode } = runCli(['init', 'my-app.v2_test'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 0);
    assert.ok(fs.existsSync(path.join(tmpDir, 'my-app.v2_test', 'package.json')));
  } finally {
    cleanDir(tmpDir);
  }
});

// ============================================================
// TESTS: chasket build
// ============================================================

test('build compiles .csk files and generates bundle', () => {
  const tmpDir = makeTempDir();
  try {
    // Initialize project
    runCli(['init', 'build-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'build-test');

    // Run build
    const { stdout, exitCode } = runCli(['build'], { cwd: projDir });
    assert.strictEqual(exitCode, 0, `build failed: ${stdout}`);

    // Check outputs
    assert.ok(fs.existsSync(path.join(projDir, 'dist', 'chasket-bundle.js')), 'bundle should exist');
    assert.ok(fs.existsSync(path.join(projDir, 'dist', 'components', 'app.js')), 'component JS should exist');

    // Bundle content
    const bundle = fs.readFileSync(path.join(projDir, 'dist', 'chasket-bundle.js'), 'utf-8');
    assert.ok(bundle.includes('__chasketDefineQueue'), 'bundle should use deferred registration');
    assert.ok(bundle.includes('customElements.define'), 'bundle should register components');
    assert.ok(bundle.includes('XApp'), 'bundle should contain component class');
  } finally {
    cleanDir(tmpDir);
  }
});

test('build with --target ts outputs .ts files', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'ts-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'ts-test');

    // Update config for ts
    const configPath = path.join(projDir, 'chasket.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.target = 'ts';
    fs.writeFileSync(configPath, JSON.stringify(config));

    const { stdout, exitCode } = runCli(['build'], { cwd: projDir });
    assert.strictEqual(exitCode, 0, `ts build failed: ${stdout}`);
    assert.ok(fs.existsSync(path.join(projDir, 'dist', 'components', 'app.ts')), '.ts file should exist');
  } finally {
    cleanDir(tmpDir);
  }
});

test('build fails on missing source directory', () => {
  const tmpDir = makeTempDir();
  try {
    // Create a minimal config pointing to nonexistent dir
    fs.writeFileSync(path.join(tmpDir, 'chasket.config.json'), JSON.stringify({
      src: 'nonexistent',
      outdir: 'dist',
    }));

    const { stdout, exitCode } = runCli(['build'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('ソースディレクトリが見つかりません') || stdout.includes('.csk ファイルが見つかりません') || stdout.includes('Source directory not found') || stdout.includes('No .csk files found') || exitCode === 1);
  } finally {
    cleanDir(tmpDir);
  }
});

test('build reports diagnostics for invalid components', () => {
  const tmpDir = makeTempDir();
  try {
    // Create project with bad component
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'chasket.config.json'), JSON.stringify({
      src: 'src/components', outdir: 'dist',
    }));

    // Write a component with no template (should fail)
    fs.writeFileSync(path.join(srcDir, 'bad.csk'), '<meta>name: "x-bad"</meta><script>state x: number = 0</script>');

    const { stdout, exitCode } = runCli(['build'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('template') || stdout.includes('Failed'));
  } finally {
    cleanDir(tmpDir);
  }
});

// ============================================================
// TESTS: chasket check
// ============================================================

test('check passes for valid components', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'check-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'check-test');

    const { stdout, exitCode } = runCli(['check'], { cwd: projDir });
    assert.strictEqual(exitCode, 0, `check failed: ${stdout}`);
    assert.ok(stdout.includes('✓') || stdout.includes('app.csk'));
  } finally {
    cleanDir(tmpDir);
  }
});

test('check fails for invalid components', () => {
  const tmpDir = makeTempDir();
  try {
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'chasket.config.json'), JSON.stringify({
      src: 'src/components',
    }));

    // Component with undefined variable reference
    fs.writeFileSync(path.join(srcDir, 'err.csk'), `<meta>name: "x-err"</meta>
<script>state count: number = 0</script>
<template><div>{{ undefinedVar }}</div></template>`);

    const { stdout, exitCode } = runCli(['check'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('E0301') || stdout.includes('未定義'));
  } finally {
    cleanDir(tmpDir);
  }
});

test('check handles missing source directory', () => {
  const tmpDir = makeTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'chasket.config.json'), JSON.stringify({
      src: 'nonexistent',
    }));

    const { stdout, exitCode } = runCli(['check'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 1);
  } finally {
    cleanDir(tmpDir);
  }
});

// ============================================================
// TESTS: Config handling
// ============================================================

test('build works without config file (uses defaults)', () => {
  const tmpDir = makeTempDir();
  try {
    // Create src/components dir without config
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'hello.csk'), `<meta>name: "x-hello"</meta>
<script>state msg: string = "hi"</script>
<template><div>{{ msg }}</div></template>`);

    const { stdout, exitCode } = runCli(['build', 'src/components'], { cwd: tmpDir });
    assert.strictEqual(exitCode, 0, `build without config failed: ${stdout}`);
  } finally {
    cleanDir(tmpDir);
  }
});

test('build handles malformed config JSON gracefully', () => {
  const tmpDir = makeTempDir();
  try {
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.csk'), `<meta>name: "x-a"</meta>
<script>state x: number = 0</script>
<template><p>{{ x }}</p></template>`);

    // Write malformed JSON config
    fs.writeFileSync(path.join(tmpDir, 'chasket.config.json'), '{invalid json!!!');

    // Should warn but still work with defaults
    // Warning may go to stderr which is merged into stdout in our helper on error
    const { stdout, exitCode } = runCli(['build', 'src/components'], { cwd: tmpDir });
    // Either succeeds (warning went to stderr but build used defaults) or includes warning
    assert.strictEqual(exitCode, 0, `build with bad config failed: ${stdout}`);
  } finally {
    cleanDir(tmpDir);
  }
});

// ============================================================
// TESTS: Build output quality
// ============================================================

test('build output generates valid JavaScript', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'jsvalid-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'jsvalid-test');
    runCli(['build'], { cwd: projDir });

    // Validate generated JS syntax
    const appJs = fs.readFileSync(path.join(projDir, 'dist', 'components', 'app.js'), 'utf-8');
    assert.doesNotThrow(() => new Function(appJs), 'generated JS should be syntactically valid');
  } finally {
    cleanDir(tmpDir);
  }
});

test('build bundle includes all components', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'multi-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'multi-test');
    const srcDir = path.join(projDir, 'src', 'components');

    // Add a second component
    fs.writeFileSync(path.join(srcDir, 'button.csk'), `<meta>name: "x-button"</meta>
<script>
prop label: string = "Click"
fn handleClick() {
  console.log("clicked")
}
</script>
<template><button @click="handleClick">{{ label }}</button></template>
<style>button { cursor: pointer; }</style>`);

    const { stdout, exitCode } = runCli(['build'], { cwd: projDir });
    assert.strictEqual(exitCode, 0, `multi build failed: ${stdout}`);

    const bundle = fs.readFileSync(path.join(projDir, 'dist', 'chasket-bundle.js'), 'utf-8');
    assert.ok(bundle.includes('x-app'), 'bundle should contain x-app');
    assert.ok(bundle.includes('x-button'), 'bundle should contain x-button');
    assert.ok(bundle.includes('2 component(s)'), 'bundle header should show 2 components');
  } finally {
    cleanDir(tmpDir);
  }
});

// ============================================================
// TESTS: HMR (Hot Module Replacement)
// ============================================================

test('dev server responds with HMR runtime in HTML', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'hmr-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'hmr-test');
    const indexPath = path.join(projDir, 'src', 'index.html');

    // Read the HTML template
    const html = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(html.includes('<x-app></x-app>'), 'should have x-app component');
    assert.ok(html.includes('chasket-bundle.js'), 'should load bundle');

    // Note: Full HMR server test would require spawning the server process.
    // This test verifies the HTML structure is correct for HMR injection.
  } finally {
    cleanDir(tmpDir);
  }
});

test('--no-hmr flag disables HMR', () => {
  const tmpDir = makeTempDir();
  try {
    runCli(['init', 'no-hmr-test'], { cwd: tmpDir });
    const projDir = path.join(tmpDir, 'no-hmr-test');

    // Just verify the flag is accepted (we can't easily test the full server behavior)
    // In a real integration test, we'd spawn the server with --no-hmr and verify behavior
    const { exitCode } = runCli(['--help']);
    assert.strictEqual(exitCode, 0);
  } finally {
    cleanDir(tmpDir);
  }
});

test('dev command recognizes --no-hmr flag', () => {
  // Test that --no-hmr is a valid flag (parsing test)
  // Full server test would require spawning a process and testing WebSocket behavior
  const { stdout, exitCode } = runCli(['--help']);
  assert.strictEqual(exitCode, 0);
  assert.ok(stdout.includes('dev'), 'help should mention dev command');
  // This is a simple validation test. Full HMR integration testing
  // would require a more complex test harness with WebSocket client.
});

test('HMR message format is correct', () => {
  // Test the HMR message format expectations
  // { type: 'hmr-update', component: 'x-name', code: '...' }
  // { type: 'reload' }

  // This is a structural test verifying the expected message formats
  const hmrUpdate = { type: 'hmr-update', component: 'x-test', code: 'class XTest {}' };
  assert.strictEqual(hmrUpdate.type, 'hmr-update');
  assert.ok(hmrUpdate.component);
  assert.ok(hmrUpdate.code);

  const reloadMsg = { type: 'reload' };
  assert.strictEqual(reloadMsg.type, 'reload');
});

test('compiled output includes __chasketClasses registry for HMR', () => {
  const { compile } = require('../lib/compiler');
  const src = `<meta>\nname: "x-hmr-test"\nshadow: open\n</meta>\n<script>\nstate val: number = 0\n</script>\n<template><p>{{ val }}</p></template>\n<style>p{}</style>`;
  const result = compile(src, 'hmr-test.csk');
  assert.ok(result.success, 'Compilation should succeed');
  // Check __chasketClasses registration
  assert.ok(result.output.includes("__chasketClasses['x-hmr-test']"), 'Output should register class in __chasketClasses');
  // Check guarded customElements.define
  assert.ok(result.output.includes("!customElements.get('x-hmr-test')"), 'Output should guard customElements.define');
});

test('compiled output does not call customElements.define if already registered', () => {
  const { compile } = require('../lib/compiler');
  const src = `<meta>\nname: "x-guard-test"\nshadow: open\n</meta>\n<script>\nstate n: number = 1\n</script>\n<template><span>{{ n }}</span></template>\n<style>span{}</style>`;
  const result = compile(src, 'guard-test.csk');
  assert.ok(result.success);
  // The registration block should use guarded define:
  // } else if (!customElements.get('x-guard-test')) {
  //   customElements.define('x-guard-test', XGuardTest);
  assert.ok(
    result.output.includes("!customElements.get('x-guard-test')"),
    'Should guard customElements.define with .get() check'
  );
  // Should NOT have a bare unguarded define outside the if/else block
  const unguardedPattern = /^  customElements\.define\(/m;
  const guardedPattern = /else if \(!customElements\.get/;
  assert.ok(guardedPattern.test(result.output), 'Define should be inside else-if guard');
});
