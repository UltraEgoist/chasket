/**
 * Chasket v0.3.0 DX Test Suite
 * 6 categories of tests to improve bug detection and developer experience
 */
const { compile } = require('../lib/compiler.js');

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

function skip(name) {
  skipped++;
  console.log(`  ⊘ ${name} (skipped)`);
}

function compileOk(src, fileName = 'test.csk', opts = {}) {
  return compile(src, fileName, opts);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 1: Generated code syntax tests
// compile() output validated with new Function()
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 1: Generated code syntax tests ━━');

{
  // 1-1: Simple component
  const r = compileOk(`<meta>
  name: "cat1-basic"
</meta>
<template>
  <div>Hello World</div>
</template>`);
  assert(r.success, '1-1: Simple component compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-1: Output is valid JS'); }
    catch (e) { assert(false, '1-1: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-2: State + computed (types required)
  const r = compileOk(`<meta>
  name: "cat1-state"
</meta>
<script>
  state count: number = 0
  computed double: number = count * 2
  fn increment() {
    count = count + 1
  }
</script>
<template>
  <div>{{ count }} x2 = {{ double }}</div>
  <button @click="increment()">+1</button>
</template>`);
  assert(r.success, '1-2: State + computed compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-2: Output is valid JS'); }
    catch (e) { assert(false, '1-2: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-3: Conditionals and loops (correct Chasket syntax)
  const r = compileOk(`<meta>
  name: "cat1-flow"
</meta>
<script>
  state items: string[] = ['a','b','c']
  state show: boolean = true
</script>
<template>
  <#if condition="show">
    <ul>
      <#for each="item" of="items">
        <li>{{ item }}</li>
      </#for>
    </ul>
  <:else>
    <p>Hidden</p>
  </#if>
</template>`);
  assert(r.success, '1-3: Conditionals + loops compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-3: Output is valid JS'); }
    catch (e) { assert(false, '1-3: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-4: Emit
  const r = compileOk(`<meta>
  name: "cat1-emit"
</meta>
<script>
  emit myEvent
  fn fire() {
    myEvent()
  }
</script>
<template>
  <button @click="fire()">Fire</button>
</template>`);
  assert(r.success, '1-4: Emit compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-4: Output is valid JS'); }
    catch (e) { assert(false, '1-4: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-5: Props
  const r = compileOk(`<meta>
  name: "cat1-props"
</meta>
<script>
  prop label: string = "default"
  prop count: number = 0
</script>
<template>
  <span>{{ label }}: {{ count }}</span>
</template>`);
  assert(r.success, '1-5: Props compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-5: Output is valid JS'); }
    catch (e) { assert(false, '1-5: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-6: Style with @media
  const r = compileOk(`<meta>
  name: "cat1-styled"
</meta>
<template>
  <div class="box">Styled</div>
</template>
<style>
  .box { color: red; padding: 10px; }
  @media (max-width: 600px) {
    .box { padding: 5px; }
  }
</style>`);
  assert(r.success, '1-6: Style block compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-6: Output is valid JS'); }
    catch (e) { assert(false, '1-6: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-7: Watch
  const r = compileOk(`<meta>
  name: "cat1-watch"
</meta>
<script>
  state query: string = ''
  state results: string[] = []
  watch query {
    console.log('query changed')
  }
  fn onInput() {
    query = e.target.value
  }
</script>
<template>
  <input :value="query" @input="onInput()" />
</template>`);
  assert(r.success, '1-7: Watch compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-7: Output is valid JS'); }
    catch (e) { assert(false, '1-7: Output is valid JS — ' + e.message); }
  }
}

{
  // 1-8: Nested elements + dynamic attributes
  const r = compileOk(`<meta>
  name: "cat1-nested"
</meta>
<script>
  state active: boolean = true
  state link: string = '/home'
</script>
<template>
  <nav>
    <a :href="link" :class.active="active">Home</a>
    <div :hidden="!active">
      <span>Content</span>
    </div>
  </nav>
</template>`);
  assert(r.success, '1-8: Nested + dynamic attrs compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '1-8: Output is valid JS'); }
    catch (e) { assert(false, '1-8: Output is valid JS — ' + e.message); }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 2: pre/code special character tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 2: pre/code special character tests ━━');

{
  // 2-1: Backticks in pre/code
  const r = compileOk(`<meta>
  name: "cat2-backtick"
</meta>
<template>
  <pre><code>const url = \`/api/users/\${userId}\`;</code></pre>
</template>`);
  assert(r.success, '2-1: Backticks in pre/code compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-1: Output is valid JS'); }
    catch (e) { assert(false, '2-1: Output is valid JS — ' + e.message); }
  }
}

{
  // 2-2: ${} interpolation in pre
  const r = compileOk(`<meta>
  name: "cat2-interp"
</meta>
<template>
  <pre>Template: \${name} and \${count + 1}</pre>
</template>`);
  assert(r.success, '2-2: ${} in pre compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-2: Output is valid JS'); }
    catch (e) { assert(false, '2-2: Output is valid JS — ' + e.message); }
  }
}

{
  // 2-3: Backslash in pre
  const r = compileOk(`<meta>
  name: "cat2-backslash"
</meta>
<template>
  <pre>Path: C:\\Users\\test\\file.txt</pre>
</template>`);
  assert(r.success, '2-3: Backslash in pre compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-3: Output is valid JS'); }
    catch (e) { assert(false, '2-3: Output is valid JS — ' + e.message); }
  }
}

{
  // 2-4: Mixed special chars
  const r = compileOk(`<meta>
  name: "cat2-mixed"
</meta>
<template>
  <pre><code>const tpl = \`Hello \${name}\`;
const path = "C:\\\\Users";
const tick = \`nested \\\`backtick\\\`\`;</code></pre>
</template>`);
  assert(r.success, '2-4: Mixed special chars compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-4: Output is valid JS'); }
    catch (e) { assert(false, '2-4: Output is valid JS — ' + e.message); }
  }
}

{
  // 2-5: HTML entities in code
  const r = compileOk(`<meta>
  name: "cat2-entities"
</meta>
<template>
  <pre><code>if (a &gt; b &amp;&amp; c &lt; d) { return true; }</code></pre>
</template>`);
  assert(r.success, '2-5: HTML entities in code compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-5: Output is valid JS'); }
    catch (e) { assert(false, '2-5: Output is valid JS — ' + e.message); }
  }
}

{
  // 2-6: Backtick in regular text
  const r = compileOk(`<meta>
  name: "cat2-text-backtick"
</meta>
<template>
  <p>Use backtick \` for template literals</p>
</template>`);
  assert(r.success, '2-6: Backtick in regular text compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '2-6: Output is valid JS'); }
    catch (e) { assert(false, '2-6: Output is valid JS — ' + e.message); }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 3: Config propagation tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 3: Config propagation tests ━━');

{
  // 3-1: shadow: "closed"
  const r = compileOk(`<meta>
  name: "cat3-shadow"
</meta>
<template>
  <div>Shadow Test</div>
</template>`, 'test.csk', { shadow: 'closed' });
  assert(r.success, '3-1: shadow:closed compiles');
  if (r.success) {
    assert(r.output.includes("'closed'") || r.output.includes('"closed"'), '3-1: Output contains closed shadow mode');
  }
}

{
  // 3-2: shadow: "open"
  const r = compileOk(`<meta>
  name: "cat3-shadow-open"
</meta>
<template>
  <div>Shadow Open</div>
</template>`, 'test.csk', { shadow: 'open' });
  assert(r.success, '3-2: shadow:open compiles');
  if (r.success) {
    assert(r.output.includes("'open'") || r.output.includes('"open"'), '3-2: Output contains open shadow mode');
  }
}

{
  // 3-3: target: "ts"
  const r = compileOk(`<meta>
  name: "cat3-ts"
</meta>
<template>
  <div>TS Target</div>
</template>`, 'test.csk', { target: 'ts' });
  assert(r.success, '3-3: target:ts compiles');
}

{
  // 3-4: Default options
  const r = compileOk(`<meta>
  name: "cat3-default"
</meta>
<template>
  <div>Default</div>
</template>`, 'test.csk', {});
  assert(r.success, '3-4: Default options compile');
  if (r.success) {
    try { new Function(r.output); assert(true, '3-4: Default output is valid JS'); }
    catch (e) { assert(false, '3-4: Default output is valid JS — ' + e.message); }
  }
}

{
  // 3-5: Minify
  const r = compileOk(`<meta>
  name: "cat3-minify"
</meta>
<template>
  <div>Minified</div>
</template>`, 'test.csk', { minify: true });
  assert(r.success, '3-5: minify:true compiles');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 4: Async state change tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 4: Async state change tests ━━');

{
  // 4-1: setTimeout with state change
  const r = compileOk(`<meta>
  name: "cat4-timeout"
</meta>
<script>
  state count: number = 0
  fn delayedIncrement() {
    setTimeout(() => { count = count + 1 }, 100)
  }
</script>
<template>
  <span>{{ count }}</span>
  <button @click="delayedIncrement()">Delay</button>
</template>`);
  assert(r.success, '4-1: setTimeout + state compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '4-1: Output is valid JS'); }
    catch (e) { assert(false, '4-1: Output is valid JS — ' + e.message); }
    assert(r.output.includes('#update') || r.output.includes('__update') || r.output.includes('update()'),
      '4-1: Output includes update mechanism');
  }
}

{
  // 4-2: Promise.then with state change
  const r = compileOk(`<meta>
  name: "cat4-promise"
</meta>
<script>
  state data: string = ''
  fn loadData() {
    fetch('/api/data').then(r => r.json()).then(d => { data = d })
  }
</script>
<template>
  <span>{{ data }}</span>
  <button @click="loadData()">Load</button>
</template>`);
  assert(r.success, '4-2: Promise.then + state compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '4-2: Output is valid JS'); }
    catch (e) { assert(false, '4-2: Output is valid JS — ' + e.message); }
  }
}

{
  // 4-3: async/await with state change
  const r = compileOk(`<meta>
  name: "cat4-async"
</meta>
<script>
  state result: string = ''
  state loading: boolean = false
  fn async fetchResult() {
    loading = true
    const r = await fetch('/api')
    const d = await r.json()
    result = d
    loading = false
  }
</script>
<template>
  <#if condition="loading">
    <span>Loading...</span>
  <:else>
    <span>{{ result }}</span>
  </#if>
  <button @click="fetchResult()">Fetch</button>
</template>`);
  assert(r.success, '4-3: async/await + state compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '4-3: Output is valid JS'); }
    catch (e) { assert(false, '4-3: Output is valid JS — ' + e.message); }
  }
}

{
  // 4-4: State changes in event handlers
  const r = compileOk(`<meta>
  name: "cat4-events"
</meta>
<script>
  state x: number = 0
  state y: number = 0
  fn handleMove() {
    x = e.clientX
    y = e.clientY
  }
</script>
<template>
  <div @mousemove="handleMove()">{{ x }}, {{ y }}</div>
</template>`);
  assert(r.success, '4-4: Event handler state changes compile');
  if (r.success) {
    try { new Function(r.output); assert(true, '4-4: Output is valid JS'); }
    catch (e) { assert(false, '4-4: Output is valid JS — ' + e.message); }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 5: Warning accuracy tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 5: Warning accuracy tests ━━');

{
  // 5-1: Static id outside loop — no W0203
  const r = compileOk(`<meta>
  name: "cat5-no-warn"
</meta>
<template>
  <div id="header">Title</div>
  <div id="content">Body</div>
</template>`);
  assert(r.success, '5-1: Static id outside loop compiles');
  const w0203 = (r.diagnostics || []).filter(d => d.code === 'W0203');
  assert(w0203.length === 0, '5-1: No W0203 warning outside loop');
}

{
  // 5-2: Static id inside <#for> — W0203 should fire
  const r = compileOk(`<meta>
  name: "cat5-warn"
</meta>
<script>
  state items: string[] = ['a','b','c']
</script>
<template>
  <#for each="item" of="items">
    <div id="fixed-id">{{ item }}</div>
  </#for>
</template>`);
  assert(r.success, '5-2: Static id inside loop compiles');
  const w0203 = (r.diagnostics || []).filter(d => d.code === 'W0203');
  assert(w0203.length > 0, '5-2: W0203 fires for static id inside loop');
}

{
  // 5-3: Dynamic id inside <#for> — no W0203
  const r = compileOk(`<meta>
  name: "cat5-dynamic-id"
</meta>
<script>
  state items: string[] = ['a','b','c']
</script>
<template>
  <#for each="item" index="i" of="items">
    <div :id="'item-' + i">{{ item }}</div>
  </#for>
</template>`);
  assert(r.success, '5-3: Dynamic id inside loop compiles');
  const w0203 = (r.diagnostics || []).filter(d => d.code === 'W0203');
  assert(w0203.length === 0, '5-3: No W0203 for dynamic id inside loop');
}

{
  // 5-4: Nested loop with static id — W0203
  const r = compileOk(`<meta>
  name: "cat5-nested-loop"
</meta>
<script>
  state rows: string[] = ['a','b']
  state cols: string[] = ['x','y']
</script>
<template>
  <#for each="row" of="rows">
    <#for each="col" of="cols">
      <td id="cell">{{ row }}-{{ col }}</td>
    </#for>
  </#for>
</template>`);
  assert(r.success, '5-4: Nested loop compiles');
  const w0203 = (r.diagnostics || []).filter(d => d.code === 'W0203');
  assert(w0203.length > 0, '5-4: W0203 fires for static id in nested loop');
}

{
  // 5-5: Diagnostic context field is populated
  const r = compileOk(`<meta>
  name: "cat5-context"
</meta>
<script>
  state items: string[] = ['a','b']
</script>
<template>
  <#for each="item" of="items">
    <div id="dup">{{ item }}</div>
  </#for>
</template>`);
  const w0203 = (r.diagnostics || []).filter(d => d.code === 'W0203');
  if (w0203.length > 0) {
    assert(w0203[0].context && w0203[0].context.length > 0, '5-5: W0203 has context field');
    console.log(`    context: "${w0203[0].context}"`);
  } else {
    assert(false, '5-5: W0203 has context field (no warning generated)');
  }
}

{
  // 5-6: E0301 (undefined var) includes context
  const r = compileOk(`<meta>
  name: "cat5-e0301-ctx"
</meta>
<template>
  <div>
    <span>{{ undefinedVar }}</span>
  </div>
</template>`);
  const e0301 = (r.diagnostics || []).filter(d => d.code === 'E0301');
  if (e0301.length > 0) {
    assert(e0301[0].context && e0301[0].context.length > 0, '5-6: E0301 has context field');
    console.log(`    context: "${e0301[0].context}"`);
  } else {
    skip('5-6: E0301 context (no E0301 generated)');
  }
}

{
  // 5-7: W0101 (unused state)
  const r = compileOk(`<meta>
  name: "cat5-unused"
</meta>
<script>
  state used: number = 0
  state unused: number = 0
</script>
<template>
  <span>{{ used }}</span>
</template>`);
  const w0101 = (r.diagnostics || []).filter(d => d.code === 'W0101');
  assert(w0101.length > 0, '5-7: W0101 fires for unused state');
  if (w0101.length > 0) {
    assert(w0101[0].message.includes('unused'), '5-7: W0101 message mentions unused var');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 6: Bundle integration tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 6: Bundle integration tests ━━');

{
  // 6-1: Two components compile and bundle into valid JS
  const r1 = compileOk(`<meta>
  name: "cat6-comp-a"
</meta>
<template>
  <div>Component A</div>
</template>`);
  const r2 = compileOk(`<meta>
  name: "cat6-comp-b"
</meta>
<template>
  <div>Component B</div>
</template>`);
  assert(r1.success && r2.success, '6-1: Both components compile');
  if (r1.success && r2.success) {
    const bundle = r1.output + '\n' + r2.output;
    try { new Function(bundle); assert(true, '6-1: Bundle is valid JS'); }
    catch (e) { assert(false, '6-1: Bundle is valid JS — ' + e.message); }
  }
}

{
  // 6-2: No duplicate customElements.define per component
  const r = compileOk(`<meta>
  name: "cat6-nodup"
</meta>
<template>
  <div>No Dup</div>
</template>`);
  if (r.success) {
    const defines = r.output.match(/customElements\.define/g) || [];
    assert(defines.length === 1, '6-2: Exactly one customElements.define per component');
  }
}

{
  // 6-3: Component name matches meta name
  const r = compileOk(`<meta>
  name: "cat6-name-check"
</meta>
<template>
  <div>Name Check</div>
</template>`);
  if (r.success) {
    assert(r.output.includes('cat6-name-check'), '6-3: Output includes component name');
  }
}

{
  // 6-4: Component referencing child
  const r = compileOk(`<meta>
  name: "cat6-parent"
</meta>
<template>
  <div>
    <cat6-child></cat6-child>
  </div>
</template>`);
  assert(r.success, '6-4: Parent referencing child compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '6-4: Output is valid JS'); }
    catch (e) { assert(false, '6-4: Output is valid JS — ' + e.message); }
  }
}

{
  // 6-5: Multiple components with same state pattern produce distinct classes
  const r1 = compileOk(`<meta>
  name: "cat6-shared-a"
</meta>
<script>
  state count: number = 0
</script>
<template>
  <span>{{ count }}</span>
</template>`);
  const r2 = compileOk(`<meta>
  name: "cat6-shared-b"
</meta>
<script>
  state count: number = 0
</script>
<template>
  <span>{{ count }}</span>
</template>`);
  if (r1.success && r2.success) {
    const bundle = r1.output + '\n' + r2.output;
    const defines = bundle.match(/customElements\.define/g) || [];
    assert(defines.length === 2, '6-5: Two defines in bundled output');
    assert(bundle.includes('cat6-shared-a') && bundle.includes('cat6-shared-b'),
      '6-5: Both component names present');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 7: watch / lifecycle / pre / helpers tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━ Category 7: watch / lifecycle / pre / helpers ━━');

{
  // 7-1: watch(dep) generates valid JS with watch handler
  const r = compileOk(`<meta>
  name: "cat7-watch"
</meta>
<script>
  state count: number = 0
  state label: string = ''
  watch(count) {
    label = 'Count: ' + count
  }
</script>
<template>
  <span>{{ label }}</span>
</template>`);
  assert(r.success, '7-1: watch(dep) compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-1: Output is valid JS'); }
    catch (e) { assert(false, '7-1: Output is valid JS — ' + e.message); }
    assert(r.output.includes('#watch_count'), '7-1: Output includes watch handler');
    assert(r.output.includes('__prev_count'), '7-1: Output includes prev value tracking');
  }
}

{
  // 7-2: watch with multiple deps
  const r = compileOk(`<meta>
  name: "cat7-watch-multi"
</meta>
<script>
  state x: number = 0
  state y: number = 0
  state sum: number = 0
  watch(x, y) {
    sum = x + y
  }
</script>
<template>
  <span>{{ sum }}</span>
</template>`);
  assert(r.success, '7-2: watch(x, y) compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-2: Output is valid JS'); }
    catch (e) { assert(false, '7-2: Output is valid JS — ' + e.message); }
    assert(r.output.includes('#watch_x_y'), '7-2: Output includes multi-dep watch handler');
  }
}

{
  // 7-3: on mount lifecycle hook populates connectedCallback
  const r = compileOk(`<meta>
  name: "cat7-mount"
</meta>
<script>
  on mount {
    console.log('component mounted')
    document.addEventListener('resize', this.handleResize)
  }
</script>
<template>
  <div>Mounted</div>
</template>`);
  assert(r.success, '7-3: on mount compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-3: Output is valid JS'); }
    catch (e) { assert(false, '7-3: Output is valid JS — ' + e.message); }
    assert(r.output.includes('console.log'), '7-3: connectedCallback has mount code');
  }
}

{
  // 7-4: on unmount lifecycle hook populates disconnectedCallback
  const r = compileOk(`<meta>
  name: "cat7-unmount"
</meta>
<script>
  on mount {
    document.addEventListener('resize', this.handleResize)
  }
  on unmount {
    document.removeEventListener('resize', this.handleResize)
  }
  fn handleResize() {
    console.log('resized')
  }
</script>
<template>
  <div>Lifecycle</div>
</template>`);
  assert(r.success, '7-4: on mount + on unmount compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-4: Output is valid JS'); }
    catch (e) { assert(false, '7-4: Output is valid JS — ' + e.message); }
    assert(r.output.includes('disconnectedCallback'), '7-4: Output has disconnectedCallback');
    assert(r.output.includes('removeEventListener'), '7-4: unmount code present');
  }
}

{
  // 7-5: <pre><code> has no whitespace inserted between tags
  const r = compileOk(`<meta>
  name: "cat7-pre"
</meta>
<template>
  <pre><code>function hello() {
  console.log('world')
}</code></pre>
</template>`);
  assert(r.success, '7-5: pre/code compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-5: Output is valid JS'); }
    catch (e) { assert(false, '7-5: Output is valid JS — ' + e.message); }
    // Check no whitespace between <pre> and <code>
    assert(r.output.includes('<pre><code>'), '7-5: No whitespace between <pre> and <code>');
    assert(!r.output.match(/<pre>\s+<code>/), '7-5: No newline/indent between <pre> and <code>');
  }
}

{
  // 7-6: <textarea> content is preserved without formatting
  const r = compileOk(`<meta>
  name: "cat7-textarea"
</meta>
<template>
  <textarea>Line 1
Line 2
Line 3</textarea>
</template>`);
  assert(r.success, '7-6: textarea compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-6: Output is valid JS'); }
    catch (e) { assert(false, '7-6: Output is valid JS — ' + e.message); }
    assert(r.output.includes('<textarea>Line 1'), '7-6: textarea content starts immediately');
  }
}

{
  // 7-7: helpers declaration generates proxy methods
  const r = compileOk(`<meta>
  name: "cat7-helpers"
  helpers: ["window.__t as tr"]
</meta>
<template>
  <h1>{{ tr('title') }}</h1>
</template>`);
  assert(r.success, '7-7: helpers compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-7: Output is valid JS'); }
    catch (e) { assert(false, '7-7: Output is valid JS — ' + e.message); }
    assert(r.output.includes('#tr('), '7-7: Output includes helper method');
    assert(r.output.includes('window.__t'), '7-7: Output includes source function');
  }
}

{
  // 7-8: helpers with multiple entries
  const r = compileOk(`<meta>
  name: "cat7-helpers-multi"
  helpers: ["window.__t as tr", "window.fmt as fmt"]
</meta>
<script>
  state name: string = 'World'
</script>
<template>
  <h1>{{ tr('greeting') }}</h1>
  <p>{{ fmt('welcome', name) }}</p>
</template>`);
  assert(r.success, '7-8: Multiple helpers compile');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-8: Output is valid JS'); }
    catch (e) { assert(false, '7-8: Output is valid JS — ' + e.message); }
    assert(r.output.includes('#tr(') && r.output.includes('#fmt('),
      '7-8: Both helper methods present');
  }
}

{
  // 7-9: helpers names don't trigger E0301 (undefined identifier)
  const r = compileOk(`<meta>
  name: "cat7-helpers-sym"
  helpers: ["window.__t as tr"]
</meta>
<template>
  <span>{{ tr('key') }}</span>
</template>`);
  assert(r.success, '7-9: helpers + template compiles');
  const e0301 = (r.diagnostics || []).filter(d => d.code === 'E0301');
  assert(e0301.length === 0, '7-9: No E0301 for helper function name');
}

{
  // 7-10: watch + on mount + helpers combined
  const r = compileOk(`<meta>
  name: "cat7-combined"
  helpers: ["window.__t as tr"]
</meta>
<script>
  state tab: string = 'home'
  state title: string = ''
  watch(tab) {
    title = tr('tab.' + tab)
  }
  on mount {
    title = tr('tab.' + tab)
  }
</script>
<template>
  <h1>{{ title }}</h1>
</template>`);
  assert(r.success, '7-10: Combined features compile');
  if (r.success) {
    try { new Function(r.output); assert(true, '7-10: Output is valid JS'); }
    catch (e) { assert(false, '7-10: Output is valid JS — ' + e.message); }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category 8: v0.2.5 Bug fixes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n--- Category 8: v0.2.5 Bug fixes ---');

// 8-1: <pre><code>{{ var }}</code></pre> interpolation compiles
{
  const r = compileOk(`<meta>name: "test-pre-code-interp"</meta>
<script>
  state snippet: string = "hello world"
</script>
<template>
  <pre><code>{{ snippet }}</code></pre>
</template>`);
  assert(r.success, '8-1: pre/code interpolation compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '8-1: Output is valid JS'); }
    catch (e) { assert(false, '8-1: Output is valid JS — ' + e.message); }
    assert(r.output.includes('this.#esc(this.#snippet)'), '8-1: Interpolation compiled inside <pre><code>');
    assert(!r.output.includes('{{ snippet }}'), '8-1: No raw {{ snippet }} in output');
  }
}

// 8-2: <pre> alone with interpolation
{
  const r = compileOk(`<meta>name: "test-pre-interp"</meta>
<script>
  state msg: string = "test"
</script>
<template>
  <pre>Result: {{ msg }}</pre>
</template>`);
  assert(r.success, '8-2: pre interpolation compiles');
  if (r.success) {
    assert(r.output.includes('this.#esc(this.#msg)'), '8-2: Interpolation compiled inside <pre>');
  }
}

// 8-3: <textarea> with interpolation
{
  const r = compileOk(`<meta>name: "test-textarea-interp"</meta>
<script>
  state content: string = "default"
</script>
<template>
  <textarea>{{ content }}</textarea>
</template>`);
  assert(r.success, '8-3: textarea interpolation compiles');
  if (r.success) {
    assert(r.output.includes('this.#esc(this.#content)'), '8-3: Interpolation compiled inside <textarea>');
  }
}

// 8-4: Escaped \{{ }} outputs literal {{ }}
{
  const r = compileOk(`<meta>name: "test-escape-braces"</meta>
<template>
  <p>\\{{ }}は補間構文です</p>
</template>`);
  assert(r.success, '8-4: Escaped braces compile');
  if (r.success) {
    try { new Function(r.output); assert(true, '8-4: Output is valid JS'); }
    catch (e) { assert(false, '8-4: Output is valid JS — ' + e.message); }
    assert(r.output.includes('{{ }}'), '8-4: Literal {{ }} preserved in output');
    assert(!r.output.includes('this.#esc()'), '8-4: No empty esc() call');
  }
}

// 8-5: Escaped \{{ name \}} outputs literal {{ name }}
{
  const r = compileOk(`<meta>name: "test-escape-named"</meta>
<template>
  <p>\\{{ name \\}} is variable syntax</p>
</template>`);
  assert(r.success, '8-5: Escaped named braces compile');
  if (r.success) {
    assert(r.output.includes('{{ name }}'), '8-5: Literal {{ name }} preserved');
    assert(!r.output.includes('this.#esc(this.#name)'), '8-5: Not treated as interpolation');
  }
}

// 8-6: Empty {{ }} treated as literal text, not interpolation
{
  const r = compileOk(`<meta>name: "test-empty-interp"</meta>
<template>
  <p>{{ }} syntax</p>
</template>`);
  assert(r.success, '8-6: Empty braces compile');
  if (r.success) {
    assert(!r.output.includes('this.#esc()'), '8-6: No empty esc() call');
    assert(r.output.includes('{{ }}'), '8-6: Empty braces preserved as text');
  }
}

// 8-7: Mixed interpolation and escaped braces
{
  const r = compileOk(`<meta>name: "test-mixed"</meta>
<script>
  state count: number = 0
</script>
<template>
  <p>Count: {{ count }}</p>
  <p>Syntax: \\{{ count \\}}</p>
</template>`);
  assert(r.success, '8-7: Mixed interpolation/escape compiles');
  if (r.success) {
    try { new Function(r.output); assert(true, '8-7: Output is valid JS'); }
    catch (e) { assert(false, '8-7: Output is valid JS — ' + e.message); }
    assert(r.output.includes('this.#esc(this.#count)'), '8-7: Real interpolation compiled');
    assert(r.output.includes('{{ count }}'), '8-7: Escaped braces preserved as text');
  }
}

// 8-8: <code> outside <pre> also supports interpolation
{
  const r = compileOk(`<meta>name: "test-code-interp"</meta>
<script>
  state val: string = "x"
</script>
<template>
  <code>{{ val }}</code>
</template>`);
  assert(r.success, '8-8: code interpolation compiles');
  if (r.success) {
    assert(r.output.includes('this.#esc(this.#val)'), '8-8: Interpolation compiled inside <code>');
  }
}

// 8-9: <pre> preserves whitespace (no extra indentation added)
{
  const r = compileOk(`<meta>name: "test-pre-ws"</meta>
<script>
  state x: string = "val"
</script>
<template>
  <pre>line1
line2
{{ x }}</pre>
</template>`);
  assert(r.success, '8-9: pre whitespace preservation compiles');
  if (r.success) {
    // The <pre> content should NOT have indentation padding added
    assert(r.output.includes('<pre>line1'), '8-9: No extra indent before pre content');
  }
}

// 8-10: Bundler import extraction does not pick up template content
{
  const r = compileOk(`<meta>name: "test-import-text"</meta>
<template>
  <h3>import - module import syntax</h3>
  <pre><code>import { ref } from 'vue'</code></pre>
</template>`);
  assert(r.success, '8-10: Template with import text compiles');
  if (r.success) {
    // Simulate bundler extraction: only lines before IIFE should be import candidates
    const lines = r.output.split('\\n');
    let importScanDone = false;
    const falseImports = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!importScanDone && trimmed.startsWith('import ')) {
        falseImports.push(trimmed);
      } else if (!importScanDone && (trimmed === '' || trimmed.startsWith('//'))) {
        // skip
      } else {
        importScanDone = true;
      }
    }
    assert(falseImports.length === 0, '8-10: No false import extraction from template content');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Results
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(failed > 0 ? 1 : 0);
