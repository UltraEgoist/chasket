/**
 * chasket-test — Chasket コンパイラ テストユーティリティライブラリ
 *
 * コンパイラの出力検証を簡潔に記述するためのアサーション群と
 * テストランナーを提供する。外部依存なし（Node.js 標準のみ）。
 *
 * @example
 *   const { suite, compileOk, compileFail } = require('./lib/chasket-test');
 *
 *   suite('My Tests', t => {
 *     t.test('basic compile', () => {
 *       const r = compileOk(`<meta>name: "x"</meta><template><p>hi</p></template>`);
 *       t.assert(r.success, 'compiles');
 *       t.outputIncludes(r, 'hi');
 *       t.validJS(r);
 *     });
 *   });
 *
 *   suite.run();
 */

'use strict';

const path = require('path');

// ─── Compiler loader ───────────────────────────────────────
let _compile;
function getCompile() {
  if (!_compile) {
    // Auto-detect compiler location relative to test/lib/
    const candidates = [
      path.resolve(__dirname, '../../lib/compiler.js'),
      path.resolve(__dirname, '../../../chasket-cli/lib/compiler.js'),
    ];
    for (const p of candidates) {
      try { _compile = require(p).compile; break; } catch {}
    }
    if (!_compile) throw new Error('Could not locate compiler.js');
  }
  return _compile;
}

// ─── Result tracking ───────────────────────────────────────
const _suites = [];
let _currentSuite = null;
let _currentTest = null;

const stats = { passed: 0, failed: 0, skipped: 0 };
const failures = [];

// ─── Colors ────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = {
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
  cyan:   s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
};

// ─── Core assertion context ────────────────────────────────
class TestContext {
  constructor(suiteName) {
    this._suiteName = suiteName;
    this._tests = [];
    this._beforeEachFn = null;
    this._afterEachFn = null;
  }

  /**
   * Register a test case.
   */
  test(name, fn) {
    this._tests.push({ name, fn, skip: false });
  }

  /**
   * Register a skipped test case.
   */
  xtest(name, _fn) {
    this._tests.push({ name, fn: null, skip: true });
  }

  /**
   * Register a setup function to run before each test.
   */
  beforeEach(fn) { this._beforeEachFn = fn; }

  /**
   * Register a teardown function to run after each test.
   */
  afterEach(fn) { this._afterEachFn = fn; }

  // ── Basic assertions ──

  /**
   * Assert a condition is truthy.
   */
  assert(condition, msg) {
    if (condition) {
      stats.passed++;
      console.log(`    ${c.green('✓')} ${msg}`);
    } else {
      stats.failed++;
      const label = `${this._suiteName} > ${_currentTest} > ${msg}`;
      failures.push(label);
      console.log(`    ${c.red('✗')} ${msg}`);
    }
  }

  /**
   * Assert two values are strictly equal.
   */
  eq(actual, expected, msg) {
    if (actual === expected) {
      stats.passed++;
      console.log(`    ${c.green('✓')} ${msg}`);
    } else {
      stats.failed++;
      const label = `${this._suiteName} > ${_currentTest} > ${msg}`;
      failures.push(label);
      console.log(`    ${c.red('✗')} ${msg}`);
      console.log(`      ${c.dim('expected:')} ${c.green(JSON.stringify(expected))}`);
      console.log(`      ${c.dim('actual:  ')} ${c.red(JSON.stringify(actual))}`);
    }
  }

  /**
   * Assert two values are deeply equal (JSON-based).
   */
  deepEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    this.eq(a, b, msg);
  }

  /**
   * Assert a string includes a substring.
   */
  includes(str, sub, msg) {
    this.assert(
      typeof str === 'string' && str.includes(sub),
      msg || `includes "${sub.length > 40 ? sub.slice(0, 40) + '...' : sub}"`
    );
  }

  /**
   * Assert a string does NOT include a substring.
   */
  notIncludes(str, sub, msg) {
    this.assert(
      typeof str === 'string' && !str.includes(sub),
      msg || `does not include "${sub.length > 40 ? sub.slice(0, 40) + '...' : sub}"`
    );
  }

  /**
   * Assert a value matches a regex.
   */
  matches(str, re, msg) {
    this.assert(re.test(str), msg || `matches ${re}`);
  }

  /**
   * Assert a function throws.
   */
  throws(fn, msg) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    this.assert(threw, msg || 'should throw');
  }

  // ── Chasket-specific assertions ──

  /**
   * Assert compile result is successful.
   */
  compileSuccess(result, msg) {
    this.assert(result.success, msg || 'compilation succeeds');
  }

  /**
   * Assert compile result has errors.
   */
  compileFails(result, msg) {
    this.assert(!result.success, msg || 'compilation fails');
  }

  /**
   * Assert compile output is valid JavaScript (via `new Function()`).
   */
  validJS(result, msg) {
    if (!result.success || !result.output) {
      this.assert(false, msg || 'output is valid JS (no output)');
      return;
    }
    try {
      new Function(result.output);
      this.assert(true, msg || 'output is valid JS');
    } catch (e) {
      stats.failed++;
      const label = `${this._suiteName} > ${_currentTest} > ${msg || 'output is valid JS'}`;
      failures.push(label);
      console.log(`    ${c.red('✗')} ${msg || 'output is valid JS'} — ${e.message}`);
    }
  }

  /**
   * Assert compile output includes a string.
   */
  outputIncludes(result, sub, msg) {
    this.includes(result.output || '', sub, msg || `output includes "${sub.slice(0, 50)}"`);
  }

  /**
   * Assert compile output does NOT include a string.
   */
  outputNotIncludes(result, sub, msg) {
    this.notIncludes(result.output || '', sub, msg || `output excludes "${sub.slice(0, 50)}"`);
  }

  /**
   * Assert diagnostics contain a specific code at a given level.
   * @param {Object} result - Compile result
   * @param {string} code - Diagnostic code (e.g., 'E0301', 'W0203')
   * @param {string} [level] - Optional level filter ('error', 'warning', 'info')
   */
  hasDiag(result, code, level, msg) {
    const diags = result.diagnostics || [];
    const match = diags.find(d =>
      d.code === code && (!level || d.level === level)
    );
    this.assert(!!match, msg || `has diagnostic ${code}${level ? ' (' + level + ')' : ''}`);
  }

  /**
   * Assert diagnostics do NOT contain a specific code.
   */
  noDiag(result, code, msg) {
    const diags = result.diagnostics || [];
    const match = diags.find(d => d.code === code);
    this.assert(!match, msg || `no diagnostic ${code}`);
  }

  /**
   * Assert the number of diagnostics at a given level.
   */
  diagCount(result, level, expected, msg) {
    const count = (result.diagnostics || []).filter(d => d.level === level).length;
    this.eq(count, expected, msg || `${level} count = ${expected}`);
  }

  /**
   * Assert output contains an interpolation for a given variable.
   * Checks for `this.#esc(this.#varName)` pattern.
   */
  hasInterpolation(result, varName, msg) {
    this.outputIncludes(
      result,
      `this.#esc(this.#${varName})`,
      msg || `interpolates ${varName}`
    );
  }

  /**
   * Assert output contains a state getter/setter pair.
   */
  hasState(result, name, msg) {
    this.outputIncludes(
      result,
      `get #${name}()`,
      msg || `has state getter for ${name}`
    );
  }

  /**
   * Assert output contains a watch handler.
   */
  hasWatch(result, deps, msg) {
    const key = Array.isArray(deps) ? deps.join('_') : deps;
    this.outputIncludes(
      result,
      `#watch_${key}`,
      msg || `has watch handler for ${key}`
    );
  }

  /**
   * Assert output contains lifecycle code in connectedCallback.
   */
  hasOnMount(result, bodySubstring, msg) {
    const ccMatch = (result.output || '').match(
      /connectedCallback\(\)\s*\{([\s\S]*?)\n  \}/
    );
    const body = ccMatch ? ccMatch[1] : '';
    this.assert(
      body.includes(bodySubstring),
      msg || `connectedCallback includes "${bodySubstring.slice(0, 40)}"`
    );
  }

  /**
   * Assert output contains lifecycle code in disconnectedCallback.
   */
  hasOnUnmount(result, bodySubstring, msg) {
    const dcMatch = (result.output || '').match(
      /disconnectedCallback\(\)\s*\{([\s\S]*?)\n  \}/
    );
    const body = dcMatch ? dcMatch[1] : '';
    this.assert(
      body.includes(bodySubstring),
      msg || `disconnectedCallback includes "${bodySubstring.slice(0, 40)}"`
    );
  }

  /**
   * Extract the template string from the #render() method.
   */
  getTemplate(result) {
    const m = (result.output || '').match(
      /tpl\.innerHTML\s*=\s*`([\s\S]*?)`;/
    );
    return m ? m[1] : '';
  }

  /**
   * Assert template includes a specific string.
   */
  templateIncludes(result, sub, msg) {
    const tpl = this.getTemplate(result);
    this.assert(
      tpl.includes(sub),
      msg || `template includes "${sub.slice(0, 50)}"`
    );
  }

  /**
   * Assert template does NOT include a specific string.
   */
  templateNotIncludes(result, sub, msg) {
    const tpl = this.getTemplate(result);
    this.assert(
      !tpl.includes(sub),
      msg || `template excludes "${sub.slice(0, 50)}"`
    );
  }
}

// ─── Compile helpers ───────────────────────────────────────

/**
 * Compile a .csk source and return the result.
 * @param {string} src - Chasket source code
 * @param {string} [fileName='test.csk']
 * @param {Object} [opts={}]
 * @returns {Object} Compile result { success, output, diagnostics }
 */
function compileOk(src, fileName = 'test.csk', opts = {}) {
  return getCompile()(src, fileName, opts);
}

/**
 * Compile expecting failure. Returns the result regardless.
 */
function compileFail(src, fileName = 'test.csk', opts = {}) {
  return getCompile()(src, fileName, opts);
}

/**
 * Create a minimal valid Chasket source with optional script and template.
 * @param {Object} opts
 * @param {string} opts.name - Component name
 * @param {string} [opts.script=''] - Script block content
 * @param {string} [opts.template='<div>test</div>'] - Template content
 * @param {string} [opts.style=''] - Style content
 * @param {string} [opts.meta=''] - Additional meta fields (after name)
 * @returns {string} Chasket source
 */
function csk({ name, script = '', template = '<div>test</div>', style = '', meta = '' }) {
  let src = `<meta>\n  name: "${name}"`;
  if (meta) src += `\n  ${meta}`;
  src += `\n</meta>`;
  if (script) src += `\n<script>\n${script}\n</script>`;
  src += `\n<template>\n  ${template}\n</template>`;
  if (style) src += `\n<style>\n${style}\n</style>`;
  return src;
}

// ─── Suite API ─────────────────────────────────────────────

/**
 * Define a test suite.
 * @param {string} name - Suite name
 * @param {function} setupFn - Receives a TestContext
 */
function suite(name, setupFn) {
  const ctx = new TestContext(name);
  setupFn(ctx);
  _suites.push({ name, ctx });
}

/**
 * Run all registered suites and print results.
 * @param {Object} [opts]
 * @param {string} [opts.filter] - Only run suites/tests matching this string
 * @param {boolean} [opts.verbose=true]
 */
suite.run = function(opts = {}) {
  const filter = opts.filter || process.argv.find(a => a.startsWith('--filter='))?.split('=')[1] || '';

  for (const { name, ctx } of _suites) {
    if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
    console.log(`\n${c.cyan('━━')} ${c.bold(name)} ${c.cyan('━━')}`);

    for (const t of ctx._tests) {
      if (filter && !t.name.toLowerCase().includes(filter.toLowerCase()) &&
          !name.toLowerCase().includes(filter.toLowerCase())) continue;

      if (t.skip) {
        stats.skipped++;
        console.log(`  ${c.yellow('⊘')} ${t.name} ${c.dim('(skipped)')}`);
        continue;
      }

      _currentTest = t.name;
      console.log(`  ${c.dim('▸')} ${t.name}`);

      try {
        if (ctx._beforeEachFn) ctx._beforeEachFn();
        t.fn();
        if (ctx._afterEachFn) ctx._afterEachFn();
      } catch (e) {
        stats.failed++;
        const label = `${name} > ${t.name} > UNCAUGHT`;
        failures.push(label);
        console.log(`    ${c.red('✗')} UNCAUGHT: ${e.message}`);
        if (e.stack) {
          const lines = e.stack.split('\n').slice(1, 3);
          lines.forEach(l => console.log(`      ${c.dim(l.trim())}`));
        }
      }
    }
  }

  // ── Summary ──
  console.log(`\n${c.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  const parts = [];
  parts.push(stats.passed > 0 ? c.green(`${stats.passed} passed`) : '0 passed');
  parts.push(stats.failed > 0 ? c.red(`${stats.failed} failed`) : '0 failed');
  if (stats.skipped > 0) parts.push(c.yellow(`${stats.skipped} skipped`));
  console.log(`Results: ${parts.join(', ')}`);

  if (failures.length > 0) {
    console.log(c.red('\nFailures:'));
    failures.forEach(f => console.log(`  ${c.red('•')} ${f}`));
  }
  console.log(c.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  process.exit(stats.failed > 0 ? 1 : 0);
};

/**
 * Get current stats (for programmatic use).
 */
suite.stats = () => ({ ...stats });

// ─── Exports ───────────────────────────────────────────────
module.exports = { suite, compileOk, compileFail, csk, TestContext };
