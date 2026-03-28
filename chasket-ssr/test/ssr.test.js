const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  renderToString,
  renderToStream,
  renderPage,
  renderPageToStream,
  parseComponent,
  getHydrationRuntime,
  escapeHtml,
  escapeAttr,
  escapeUrl,
} = require('../index.js');

// ============================================================
// escapeHtml
// ============================================================

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('returns empty string for null/undefined', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  it('preserves safe strings', () => {
    assert.strictEqual(escapeHtml('Hello World'), 'Hello World');
  });

  it('converts numbers to string', () => {
    assert.strictEqual(escapeHtml(42), '42');
  });
});

// ============================================================
// escapeUrl
// ============================================================

describe('escapeUrl', () => {
  it('blocks javascript: URLs', () => {
    assert.strictEqual(escapeUrl('javascript:alert(1)'), 'about:blank');
  });

  it('blocks double-encoded javascript: URLs', () => {
    assert.strictEqual(escapeUrl('java%73cript:alert(1)'), 'about:blank');
  });

  it('blocks triple-encoded javascript: URLs', () => {
    assert.strictEqual(escapeUrl('java%2573cript:alert(1)'), 'about:blank');
  });

  it('blocks data: URLs', () => {
    assert.strictEqual(escapeUrl('data:text/html,<script>alert(1)</script>'), 'about:blank');
  });

  it('allows safe URLs', () => {
    assert.strictEqual(escapeUrl('https://example.com'), 'https://example.com');
  });

  it('allows relative URLs', () => {
    assert.strictEqual(escapeUrl('/about'), '/about');
  });

  it('returns empty for null', () => {
    assert.strictEqual(escapeUrl(null), '');
  });
});

// ============================================================
// parseComponent
// ============================================================

describe('parseComponent', () => {
  it('parses meta block', () => {
    const src = `<meta>
  name: "x-hello"
  shadow: open
</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
    const comp = parseComponent(src);
    assert.strictEqual(comp.meta.name, 'x-hello');
    assert.strictEqual(comp.meta.shadow, 'open');
  });

  it('parses state declarations', () => {
    const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
  state name: string = "Hello"
</script>
<template><div>{{ count }}</div></template>`;
    const comp = parseComponent(src);
    assert.strictEqual(comp.declarations.count.kind, 'state');
    assert.strictEqual(comp.declarations.count.init, '0');
    assert.strictEqual(comp.declarations.name.kind, 'state');
    assert.strictEqual(comp.declarations.name.init, '"Hello"');
  });

  it('parses prop declarations', () => {
    const src = `<meta>name: "x-test"</meta>
<script>
  prop title: string = "default"
  prop size: number
</script>
<template><div>{{ title }}</div></template>`;
    const comp = parseComponent(src);
    assert.strictEqual(comp.declarations.title.kind, 'prop');
    assert.strictEqual(comp.declarations.title.default, '"default"');
    assert.strictEqual(comp.declarations.size.kind, 'prop');
  });

  it('parses computed declarations', () => {
    const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 0
  computed doubled: number = count * 2
</script>
<template><div>{{ doubled }}</div></template>`;
    const comp = parseComponent(src);
    assert.strictEqual(comp.declarations.doubled.kind, 'computed');
    assert.strictEqual(comp.declarations.doubled.expr, 'count * 2');
  });
});

// ============================================================
// renderToString — Basic Rendering
// ============================================================

describe('renderToString', () => {
  it('renders a simple component with state', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 0</script>
<template><div class="counter">{{ count }}</div></template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('0'), 'Should render initial state value');
    assert.ok(html.includes('<div class="counter">'), 'Should render element');
  });

  it('renders with state overrides', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
    const html = renderToString(src, { state: { count: 42 }, wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('42'), 'Should render overridden state value');
  });

  it('renders with prop values', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>prop title: string = "default"</script>
<template><h1>{{ title }}</h1></template>`;
    const html = renderToString(src, { props: { title: 'Custom Title' }, wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('Custom Title'), 'Should render prop value');
  });

  it('renders computed values', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>
  state count: number = 5
  computed doubled: number = count * 2
</script>
<template><div>{{ doubled }}</div></template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('10'), 'Should render computed value');
  });

  it('wraps in custom element tag by default', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state x: number = 0</script>
<template><div>{{ x }}</div></template>`;
    const html = renderToString(src, { includeStyle: false });
    assert.ok(html.startsWith('<x-hello>'), 'Should start with custom element tag');
    assert.ok(html.endsWith('</x-hello>'), 'Should end with closing tag');
  });

  it('includes style when present', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state x: number = 0</script>
<template><div>test</div></template>
<style>.counter { color: red; }</style>`;
    const html = renderToString(src, { wrapInTag: false });
    assert.ok(html.includes('<style>'), 'Should include style tag');
    assert.ok(html.includes('color: red'), 'Should include CSS');
  });
});

// ============================================================
// renderToString — Conditional Rendering
// ============================================================

describe('renderToString — conditionals', () => {
  it('renders #if block when condition is true', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state show: boolean = true</script>
<template>
  <#if condition="show"><div>visible</div></#if>
</template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('visible'));
  });

  it('does not render #if block when condition is false', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state show: boolean = false</script>
<template>
  <#if condition="show"><div>visible</div></#if>
</template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(!html.includes('visible'));
  });

  it('renders :else block when condition is false', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state loggedIn: boolean = false</script>
<template>
  <#if condition="loggedIn"><div>Welcome</div><:else><div>Please login</div></#if>
</template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('Please login'));
    assert.ok(!html.includes('Welcome'));
  });
});

// ============================================================
// renderToString — Loop Rendering
// ============================================================

describe('renderToString — loops', () => {
  it('renders #for loop', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state items: string[] = ["Apple", "Banana", "Cherry"]</script>
<template>
  <ul>
    <#for each="item" of="items"><li>{{ item }}</li></#for>
  </ul>
</template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('Apple'));
    assert.ok(html.includes('Banana'));
    assert.ok(html.includes('Cherry'));
  });

  it('renders :empty block for empty arrays', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state items: string[] = []</script>
<template>
  <#for each="item" of="items"><li>{{ item }}</li><:empty><p>No items</p></:empty></#for>
</template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('No items'));
    assert.ok(!html.includes('<li>'));
  });
});

// ============================================================
// renderToString — Hydration
// ============================================================

describe('renderToString — hydration', () => {
  it('adds hydration markers when hydrate=true', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 5</script>
<template><div>{{ count }}</div></template>`;
    const html = renderToString(src, { hydrate: true, includeStyle: false });
    assert.ok(html.includes('data-chasket-hydrate'), 'Should include hydration marker');
    assert.ok(html.includes('data-chasket-state'), 'Should include serialized state');
  });

  it('serializes state for hydration', () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state name: string = "World"</script>
<template><div>{{ name }}</div></template>`;
    const html = renderToString(src, { hydrate: true, includeStyle: false });
    // State is serialized in data-chasket-state attr (HTML-escaped)
    assert.ok(html.includes('data-chasket-state='), 'Should include state attribute');
    assert.ok(html.includes('World'), 'Should include state value');
  });
});

// ============================================================
// renderToString — XSS Prevention
// ============================================================

describe('renderToString — XSS prevention', () => {
  it('escapes interpolated values', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state text: string = "<b>bold</b>"</script>
<template><div>{{ text }}</div></template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(!html.includes('<b>bold</b>'), 'Should not contain unescaped HTML');
    assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'), 'Should contain escaped HTML');
  });

  it('escapes state overrides containing XSS payloads', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state text: string = "safe"</script>
<template><div>{{ text }}</div></template>`;
    const html = renderToString(src, {
      state: { text: '<img onerror=alert(1) src=x>' },
      wrapInTag: false,
      includeStyle: false,
    });
    assert.ok(!html.includes('<img'), 'Should not contain unescaped img tag');
    assert.ok(html.includes('&lt;img'), 'Should contain escaped img tag');
  });

  it('sanitizes dynamic href', () => {
    const src = `<meta>name: "x-test"</meta>
<script>state url: string = "javascript:alert(1)"</script>
<template><a :href="url">link</a></template>`;
    const html = renderToString(src, { wrapInTag: false, includeStyle: false });
    assert.ok(html.includes('about:blank'), 'Should block javascript: URL');
    assert.ok(!html.includes('javascript:'), 'Should not contain javascript: URL');
  });
});

// ============================================================
// renderPage
// ============================================================

describe('renderPage', () => {
  it('generates a complete HTML page', () => {
    const html = renderPage({
      title: 'My App',
      body: '<x-app>content</x-app>',
      bundlePath: '/dist/bundle.js',
    });
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>My App</title>'));
    assert.ok(html.includes('<x-app>content</x-app>'));
    assert.ok(html.includes('src="/dist/bundle.js"'));
  });

  it('escapes title to prevent XSS', () => {
    const html = renderPage({ title: '<script>alert(1)</script>' });
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('includes meta tags', () => {
    const html = renderPage({
      title: 'Test',
      meta: { description: 'A test page', author: 'Chasket' },
    });
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('content="A test page"'));
  });
});

// ============================================================
// getHydrationRuntime
// ============================================================

describe('getHydrationRuntime', () => {
  it('returns a JavaScript string', () => {
    const runtime = getHydrationRuntime();
    assert.ok(typeof runtime === 'string');
    assert.ok(runtime.includes('__chasketHydrate'));
    assert.ok(runtime.includes('data-chasket-hydrate'));
  });
});

// ============================================================
// renderToStream
// ============================================================

/**
 * Helper: collect all chunks from a Readable stream into a single string.
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? chunk : chunk.toString()));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}

/**
 * Helper: collect individual chunks from a Readable stream.
 */
function streamToChunks(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? chunk : chunk.toString()));
    stream.on('end', () => resolve(chunks));
    stream.on('error', reject);
  });
}

describe('renderToStream', () => {
  it('produces the same output as renderToString', async () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 0</script>
<template><div class="counter">{{ count }}</div></template>
<style>.counter { color: red; }</style>`;
    const stringResult = renderToString(src);
    const streamResult = await streamToString(renderToStream(src));
    assert.strictEqual(streamResult, stringResult);
  });

  it('produces the same output with state overrides', async () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 0</script>
<template><div>{{ count }}</div></template>`;
    const opts = { state: { count: 99 } };
    const stringResult = renderToString(src, opts);
    const streamResult = await streamToString(renderToStream(src, opts));
    assert.strictEqual(streamResult, stringResult);
  });

  it('supports hydration markers', async () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 5</script>
<template><div>{{ count }}</div></template>`;
    const html = await streamToString(renderToStream(src, { hydrate: true, includeStyle: false }));
    assert.ok(html.includes('data-chasket-hydrate'));
    assert.ok(html.includes('data-chasket-state'));
  });

  it('emits multiple chunks', async () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state count: number = 0</script>
<template><div class="counter">{{ count }}</div></template>
<style>.counter { color: red; }</style>`;
    const chunks = await streamToChunks(renderToStream(src, { chunkSize: 10 }));
    assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);
  });

  it('works without wrap tag and without style', async () => {
    const src = `<meta>name: "x-hello"</meta>
<script>state x: number = 42</script>
<template><span>{{ x }}</span></template>`;
    const opts = { wrapInTag: false, includeStyle: false };
    const stringResult = renderToString(src, opts);
    const streamResult = await streamToString(renderToStream(src, opts));
    assert.strictEqual(streamResult, stringResult);
  });

  it('handles conditionals and loops correctly', async () => {
    const src = `<meta>name: "x-test"</meta>
<script>
  state show: boolean = true
  state items: string[] = ["A", "B"]
</script>
<template>
  <#if condition="show"><div>visible</div></#if>
  <ul><#for each="item" of="items"><li>{{ item }}</li></#for></ul>
</template>`;
    const html = await streamToString(renderToStream(src, { wrapInTag: false, includeStyle: false }));
    assert.ok(html.includes('visible'));
    assert.ok(html.includes('A'));
    assert.ok(html.includes('B'));
  });

  it('escapes XSS in stream output', async () => {
    const src = `<meta>name: "x-test"</meta>
<script>state text: string = "safe"</script>
<template><div>{{ text }}</div></template>`;
    const html = await streamToString(renderToStream(src, {
      state: { text: '<script>alert(1)</script>' },
      wrapInTag: false,
      includeStyle: false,
    }));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('renders computed values in stream', async () => {
    const src = `<meta>name: "x-test"</meta>
<script>
  state count: number = 3
  computed doubled: number = count * 2
</script>
<template><div>{{ doubled }}</div></template>`;
    const html = await streamToString(renderToStream(src, { wrapInTag: false, includeStyle: false }));
    assert.ok(html.includes('6'));
  });
});

// ============================================================
// renderPageToStream
// ============================================================

describe('renderPageToStream', () => {
  it('produces same output as renderPage with string body', async () => {
    const opts = {
      title: 'My App',
      body: '<x-app>content</x-app>',
      bundlePath: '/dist/bundle.js',
    };
    const stringResult = renderPage(opts);
    const streamResult = await streamToString(renderPageToStream(opts));
    assert.strictEqual(streamResult, stringResult);
  });

  it('streams in multiple chunks', async () => {
    const opts = {
      title: 'Test',
      body: '<div>Hello World</div>',
    };
    const chunks = await streamToChunks(renderPageToStream(opts));
    assert.ok(chunks.length >= 2, `Expected at least 2 chunks (head + body + tail), got ${chunks.length}`);
  });

  it('includes meta tags', async () => {
    const html = await streamToString(renderPageToStream({
      title: 'Test',
      meta: { description: 'A test page' },
    }));
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('content="A test page"'));
  });

  it('escapes title in stream', async () => {
    const html = await streamToString(renderPageToStream({
      title: '<script>alert(1)</script>',
    }));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('accepts a Readable stream as body', async () => {
    const { Readable } = require('stream');
    const bodyStream = new Readable({
      read() {
        this.push('<div>streamed content</div>');
        this.push(null);
      },
    });
    const html = await streamToString(renderPageToStream({
      title: 'Stream Test',
      body: bodyStream,
    }));
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>Stream Test</title>'));
    assert.ok(html.includes('<div>streamed content</div>'));
    assert.ok(html.includes('</html>'));
  });
});
