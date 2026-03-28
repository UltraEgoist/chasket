/**
 * @chasket/chasket-ssr — Server-Side Rendering for Chasket Web Components
 *
 * Compiles .csk source files to static HTML strings on the server,
 * with optional hydration markers for client-side activation.
 *
 * Usage:
 *   const { renderToString } = require('@chasket/chasket-ssr');
 *   const { compile } = require('@chasket/chasket-cli');
 *
 *   const html = renderToString(chasketSource, {
 *     props: { title: 'Hello' },
 *     state: { count: 5 },
 *   });
 *
 * @module @chasket/chasket-ssr
 */

'use strict';

const { compile, splitBlocks, parseTemplateNodes } = require('../chasket-cli/lib/compiler');

// ============================================================
// HTML Escaping (server-side equivalents of #esc, #escAttr, #escUrl)
// ============================================================

function escapeHtml(val) {
  if (val == null) return '';
  const s = String(val);
  if (!/[&<>"'\n\r]/.test(s)) return s;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

function escapeAttr(val) {
  if (val == null) return '';
  const s = String(val);
  if (!/[&<>"'\n\r]/.test(s)) return s;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

function escapeUrl(val) {
  if (val == null) return '';
  const s = String(val).trim();
  // Iterative decode to prevent multi-level encoding bypass
  let decoded = s;
  for (let i = 0; i < 5; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (e) { break; }
  }
  const normalized = decoded.replace(/[\s\x00-\x1F]/g, '');
  if (/(javascript|data|vbscript|blob|file)\s*:/i.test(normalized)) return 'about:blank';
  return escapeAttr(s);
}

// ============================================================
// Expression Evaluator (safe, sandboxed)
// ============================================================

/**
 * Create an expression evaluator with the given context variables.
 * Uses Function constructor for safe evaluation with explicit scope.
 *
 * @param {Object} context - Variables available in expressions
 * @returns {Function} Evaluator function: (expr) => value
 */
function createEvaluator(context) {
  const keys = Object.keys(context);
  const values = keys.map(k => context[k]);

  // セキュリティ: プロトタイプ汚染を防止するため、危険なグローバル名をundefinedでシャドウ
  const blockedNames = [
    'constructor', 'prototype', '__proto__',
    '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__',
  ];
  // Only shadow names that aren't already in the user context
  const extraKeys = blockedNames.filter(n => !keys.includes(n));
  const allKeys = [...keys, ...extraKeys];
  const allValues = [...values, ...extraKeys.map(() => undefined)];

  return function evaluate(expr) {
    try {
      const fn = new Function(...allKeys, `return (${expr});`);
      return fn(...allValues);
    } catch (e) {
      return undefined;
    }
  };
}

// ============================================================
// Template Renderer
// ============================================================

/**
 * Render template AST nodes to an HTML string.
 *
 * @param {Array} nodes - Template AST nodes from the Chasket parser
 * @param {Function} evaluate - Expression evaluator
 * @param {Object} context - Current variable context
 * @returns {string} Rendered HTML
 */
function renderNodes(nodes, evaluate, context) {
  let html = '';

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        html += node.value;
        break;

      case 'interpolation': {
        const val = evaluate(node.expr);
        html += escapeHtml(val);
        break;
      }

      case 'element':
        html += renderElement(node, evaluate, context);
        break;

      case 'if':
        html += renderIf(node, evaluate, context);
        break;

      case 'for':
        html += renderFor(node, evaluate, context);
        break;
    }
  }

  return html;
}

/**
 * Render an element node to HTML.
 */
function renderElement(node, evaluate, context) {
  const tag = node.tag;

  // Build attributes string
  let attrs = '';
  let innerHTML = null;

  for (const attr of node.attrs) {
    if (attr.ref) continue; // Skip ref attributes (client-side only)

    if (attr.html) {
      // @html directive — raw HTML (dangerous, but user-opted-in)
      innerHTML = evaluate(attr.value);
      continue;
    }

    if (attr.event) continue; // Skip event handlers (client-side only)
    if (attr.bind) continue; // Skip :bind (client-side only)
    if (attr.spread) continue; // Skip spread (complex, client-side only)

    if (attr.dynamic) {
      // Dynamic attribute: :name="expr"
      const val = evaluate(attr.value);
      if (val === false || val == null) continue; // Don't render false/null attributes
      if (val === true) {
        attrs += ` ${attr.name}`;
      } else if (['href', 'src', 'action', 'formaction'].includes(attr.name)) {
        attrs += ` ${attr.name}="${escapeUrl(val)}"`;
      } else {
        attrs += ` ${attr.name}="${escapeAttr(val)}"`;
      }
    } else {
      // Static attribute
      if (attr.value) {
        attrs += ` ${attr.name}="${escapeAttr(attr.value)}"`;
      } else {
        attrs += ` ${attr.name}`;
      }
    }
  }

  // Self-closing tags
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  if (node.selfClosing || voidTags.has(tag)) {
    return `<${tag}${attrs}>`;
  }

  // Render children
  const children = innerHTML != null
    ? String(innerHTML)
    : renderNodes(node.children, evaluate, context);

  return `<${tag}${attrs}>${children}</${tag}>`;
}

/**
 * Render an if/else-if/else block.
 */
function renderIf(node, evaluate, context) {
  // Test main condition
  if (evaluate(node.condition)) {
    return renderNodes(node.children, evaluate, context);
  }

  // Test else-if chain
  if (node.elseIfChain) {
    for (const branch of node.elseIfChain) {
      if (evaluate(branch.condition)) {
        return renderNodes(branch.children, evaluate, context);
      }
    }
  }

  // Else branch
  if (node.elseChildren) {
    return renderNodes(node.elseChildren, evaluate, context);
  }

  return '';
}

/**
 * Render a for loop block.
 */
function renderFor(node, evaluate, context) {
  const array = evaluate(node.of);

  if (!array || !Array.isArray(array) || array.length === 0) {
    // Empty array — render <:empty> block if present
    if (node.emptyChildren) {
      return renderNodes(node.emptyChildren, evaluate, context);
    }
    return '';
  }

  let html = '';
  for (let idx = 0; idx < array.length; idx++) {
    const item = array[idx];

    // Create new context with loop variables
    const loopContext = { ...context };
    loopContext[node.each] = item;
    if (node.index) {
      loopContext[node.index] = idx;
    }

    // Create new evaluator with loop variables
    const loopEval = createEvaluator(loopContext);
    html += renderNodes(node.children, loopEval, loopContext);
  }

  return html;
}

// ============================================================
// Main API
// ============================================================

/**
 * Parse a .csk source file and extract component data for SSR.
 *
 * @param {string} source - Raw .csk source code
 * @returns {Object} Parsed component: { meta, script, template, style }
 */
function parseComponent(source) {
  // Use compiler's splitBlocks to extract blocks
  const blocks = splitBlocks(source);

  const metaBlock = blocks.find(b => b.type === 'meta');
  const scriptBlock = blocks.find(b => b.type === 'script');
  const templateBlock = blocks.find(b => b.type === 'template');
  const styleBlock = blocks.find(b => b.type === 'style');

  // Parse meta
  const meta = {};
  if (metaBlock) {
    for (const line of metaBlock.content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))) {
      const m = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (!m) continue;
      const val = m[2].trim().replace(/\s*\/\/.*$/, '').trim().replace(/^["']|["']$/g, '');
      switch (m[1]) {
        case 'name': meta.name = val; break;
        case 'shadow': meta.shadow = val; break;
      }
    }
  }

  // Parse script declarations to extract initial state/props/computed
  const declarations = {};
  if (scriptBlock) {
    const lines = scriptBlock.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      let m;
      // state name: type = value
      if ((m = trimmed.match(/^state\s+(\w+)\s*:\s*[^=]+\s*=\s*(.+)$/))) {
        declarations[m[1]] = { kind: 'state', init: m[2].trim() };
      }
      // prop name: type = value
      else if ((m = trimmed.match(/^prop\s+(\w+)\s*:\s*[^=]+?\s*(?:=\s*(.+))?$/))) {
        declarations[m[1]] = { kind: 'prop', default: m[2] ? m[2].trim() : undefined };
      }
      // computed name: type = expr
      else if ((m = trimmed.match(/^computed\s+(\w+)\s*:\s*[^=]+\s*=\s*(.+)$/))) {
        declarations[m[1]] = { kind: 'computed', expr: m[2].trim() };
      }
    }
  }

  // Parse template
  const template = templateBlock ? parseTemplateNodes(templateBlock.content) : [];

  return { meta, declarations, template, style: styleBlock ? styleBlock.content : '' };
}

/**
 * Render a Chasket component to an HTML string.
 *
 * @param {string} source - Raw .csk source code
 * @param {Object} [options={}] - Rendering options
 * @param {Object} [options.props={}] - Prop values to pass to the component
 * @param {Object} [options.state={}] - State overrides
 * @param {boolean} [options.hydrate=false] - Add hydration markers for client-side activation
 * @param {boolean} [options.includeStyle=true] - Include <style> in output
 * @param {boolean} [options.wrapInTag=true] - Wrap output in the custom element tag
 * @returns {string} Rendered HTML string
 */
function renderToString(source, options = {}) {
  const {
    props = {},
    state = {},
    hydrate = false,
    includeStyle = true,
    wrapInTag = true,
  } = options;

  const component = parseComponent(source);

  // Build context: initial state values + prop values + computed values
  const context = {};

  // 1. Evaluate initial state values
  for (const [name, decl] of Object.entries(component.declarations)) {
    if (decl.kind === 'state' && decl.init) {
      try {
        const fn = new Function(`return (${decl.init});`);
        context[name] = fn();
      } catch (e) {
        context[name] = undefined;
      }
    }
    if (decl.kind === 'prop') {
      if (decl.default) {
        try {
          const fn = new Function(`return (${decl.default});`);
          context[name] = fn();
        } catch (e) {
          context[name] = undefined;
        }
      }
    }
  }

  // セキュリティ: プロトタイプ汚染を防止する危険なキーのフィルタ
  const isDangerousKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';

  // 2. Apply prop overrides
  for (const [key, val] of Object.entries(props)) {
    if (isDangerousKey(key)) continue;
    context[key] = val;
  }

  // 3. Apply state overrides
  for (const [key, val] of Object.entries(state)) {
    if (isDangerousKey(key)) continue;
    context[key] = val;
  }

  // 4. Evaluate computed values (simple expressions only)
  for (const [name, decl] of Object.entries(component.declarations)) {
    if (decl.kind === 'computed' && decl.expr) {
      try {
        const evaluate = createEvaluator(context);
        context[name] = evaluate(decl.expr);
      } catch (e) {
        context[name] = undefined;
      }
    }
  }

  // Render template
  const evaluate = createEvaluator(context);
  let html = renderNodes(component.template, evaluate, context);

  // Include style
  if (includeStyle && component.style) {
    const minStyle = component.style
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    html = `<style>${minStyle}</style>${html}`;
  }

  // Wrap in custom element tag
  if (wrapInTag && component.meta.name) {
    const tag = component.meta.name;
    const hydrateAttr = hydrate ? ' data-chasket-hydrate' : '';
    const stateAttr = hydrate
      ? ` data-chasket-state="${escapeAttr(JSON.stringify(context))}"`
      : '';
    html = `<${tag}${hydrateAttr}${stateAttr}>${html}</${tag}>`;
  }

  return html;
}

/**
 * Render multiple components and compose them into a full HTML page.
 *
 * @param {Object} options - Page rendering options
 * @param {string} options.title - Page title
 * @param {string} options.body - Pre-rendered body HTML
 * @param {string} [options.lang='ja'] - HTML lang attribute
 * @param {string} [options.bundlePath] - Path to client-side bundle for hydration
 * @param {string} [options.head=''] - Additional head content
 * @param {Object} [options.meta={}] - Meta tags {name: content}
 * @returns {string} Complete HTML page
 */
function renderPage(options) {
  const {
    title = '',
    body = '',
    lang = 'ja',
    bundlePath,
    head = '',
    meta = {},
  } = options;

  const metaTags = Object.entries(meta)
    .map(([name, content]) => `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`)
    .join('\n    ');

  const scriptTag = bundlePath
    ? `<script src="${escapeAttr(bundlePath)}" defer></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${metaTags}
    <title>${escapeHtml(title)}</title>
    ${head}
</head>
<body>
    ${body}
    ${scriptTag}
</body>
</html>`;
}

/**
 * Client-side hydration script that activates server-rendered components.
 * Include this in the client bundle or inject via <script>.
 *
 * @returns {string} Hydration runtime JavaScript code
 */
function getHydrationRuntime() {
  return `
(function() {
  'use strict';
  window.__chasketHydrate = function() {
    const elements = document.querySelectorAll('[data-chasket-hydrate]');
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      const Cls = customElements.get(tag);
      if (!Cls) {
        console.warn('[chasket-hydrate] No class registered for', tag);
        continue;
      }
      // Restore state from SSR
      const stateStr = el.getAttribute('data-chasket-state');
      if (stateStr) {
        try {
          const state = JSON.parse(stateStr);
          // State will be applied after upgrade
          el.__chasketSSRState = state;
        } catch (e) {
          console.error('[chasket-hydrate] Failed to parse state for', tag, e);
        }
      }
      // Remove hydration markers
      el.removeAttribute('data-chasket-hydrate');
      el.removeAttribute('data-chasket-state');
      // Upgrade the element if not already upgraded
      if (!(el instanceof Cls)) {
        customElements.upgrade(el);
      }
    }
  };
  // Auto-hydrate when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.__chasketHydrate);
  } else {
    window.__chasketHydrate();
  }
})();
`;
}

// ============================================================
// Streaming SSR
// ============================================================

const { Readable } = require('stream');

/**
 * Render a Chasket component as a Node.js Readable stream.
 *
 * Streams HTML in chunks to improve TTFB (Time To First Byte).
 * The stream emits the opening tag, style, template chunks, and closing tag
 * in sequence, allowing the browser to begin parsing before rendering completes.
 *
 * @param {string} source - Raw .csk source code
 * @param {Object} [options={}] - Rendering options (same as renderToString)
 * @param {Object} [options.props={}] - Prop values
 * @param {Object} [options.state={}] - State overrides
 * @param {boolean} [options.hydrate=false] - Add hydration markers
 * @param {boolean} [options.includeStyle=true] - Include <style> in output
 * @param {boolean} [options.wrapInTag=true] - Wrap in custom element tag
 * @param {number} [options.chunkSize=512] - Target chunk size in characters
 * @param {number} [options.highWaterMark=1024] - Stream buffer size in bytes
 * @returns {import('stream').Readable} Readable stream of HTML chunks
 */
function renderToStream(source, options = {}) {
  const {
    props = {},
    state = {},
    hydrate = false,
    includeStyle = true,
    wrapInTag = true,
    chunkSize = 512,
    highWaterMark = 1024,
  } = options;

  const component = parseComponent(source);

  // Build context (same logic as renderToString)
  const context = {};

  for (const [name, decl] of Object.entries(component.declarations)) {
    if (decl.kind === 'state' && decl.init) {
      try { context[name] = new Function(`return (${decl.init});`)(); }
      catch (e) { context[name] = undefined; }
    }
    if (decl.kind === 'prop') {
      if (decl.default) {
        try { context[name] = new Function(`return (${decl.default});`)(); }
        catch (e) { context[name] = undefined; }
      }
    }
  }

  const isDangerousKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';
  for (const [key, val] of Object.entries(props)) { if (!isDangerousKey(key)) context[key] = val; }
  for (const [key, val] of Object.entries(state)) { if (!isDangerousKey(key)) context[key] = val; }

  for (const [name, decl] of Object.entries(component.declarations)) {
    if (decl.kind === 'computed' && decl.expr) {
      try { context[name] = createEvaluator(context)(decl.expr); }
      catch (e) { context[name] = undefined; }
    }
  }

  // Pre-render all chunks
  const chunks = [];

  // Opening tag
  if (wrapInTag && component.meta.name) {
    const tag = component.meta.name;
    const hydrateAttr = hydrate ? ' data-chasket-hydrate' : '';
    const stateAttr = hydrate
      ? ` data-chasket-state="${escapeAttr(JSON.stringify(context))}"`
      : '';
    chunks.push(`<${tag}${hydrateAttr}${stateAttr}>`);
  }

  // Style
  if (includeStyle && component.style) {
    const minStyle = component.style
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    chunks.push(`<style>${minStyle}</style>`);
  }

  // Template — split into target-sized chunks
  const evaluate = createEvaluator(context);
  const fullHtml = renderNodes(component.template, evaluate, context);

  for (let i = 0; i < fullHtml.length; i += chunkSize) {
    chunks.push(fullHtml.slice(i, i + chunkSize));
  }
  // If empty template, push an empty string to ensure at least one body chunk
  if (fullHtml.length === 0) {
    chunks.push('');
  }

  // Closing tag
  if (wrapInTag && component.meta.name) {
    chunks.push(`</${component.meta.name}>`);
  }

  let index = 0;
  const stream = new Readable({
    highWaterMark,
    read() {
      if (index < chunks.length) {
        this.push(chunks[index++]);
      } else {
        this.push(null); // EOF
      }
    },
  });

  return stream;
}

/**
 * Render a complete HTML page as a Readable stream.
 *
 * Streams the page structure with early head flush, so the browser can start
 * loading stylesheets and scripts while the body is still rendering.
 *
 * @param {Object} options - Page rendering options
 * @param {string} options.title - Page title
 * @param {string|import('stream').Readable} options.body - Body HTML string or Readable stream
 * @param {string} [options.lang='ja'] - HTML lang attribute
 * @param {string} [options.bundlePath] - Path to client-side bundle
 * @param {string} [options.head=''] - Additional head content
 * @param {Object} [options.meta={}] - Meta tags {name: content}
 * @param {number} [options.highWaterMark=1024] - Stream buffer size
 * @returns {import('stream').Readable} Readable stream of complete HTML page
 */
function renderPageToStream(options = {}) {
  const {
    title = '',
    body = '',
    lang = 'ja',
    bundlePath,
    head = '',
    meta = {},
    highWaterMark = 1024,
  } = options;

  const metaTags = Object.entries(meta)
    .map(([name, content]) => `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`)
    .join('\n    ');

  const headHtml = `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${metaTags}
    <title>${escapeHtml(title)}</title>
    ${head}
</head>
<body>
    `;

  const scriptTag = bundlePath
    ? `\n    <script src="${escapeAttr(bundlePath)}" defer></script>`
    : '';

  const tailHtml = `${scriptTag}
</body>
</html>`;

  // If body is a string, simple stream
  if (typeof body === 'string') {
    const chunks = [headHtml, body, tailHtml];
    let index = 0;
    return new Readable({
      highWaterMark,
      read() {
        if (index < chunks.length) {
          this.push(chunks[index++]);
        } else {
          this.push(null);
        }
      },
    });
  }

  // If body is a Readable stream, collect all body data first then emit
  // This is simpler and avoids complex async read() coordination
  const bodyChunks = [];

  body.on('data', (chunk) => {
    bodyChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
  });

  const stream = new Readable({ highWaterMark, read() {} });

  body.on('end', () => {
    stream.push(headHtml);
    for (const chunk of bodyChunks) {
      stream.push(chunk);
    }
    stream.push(tailHtml);
    stream.push(null);
  });

  body.on('error', (err) => {
    stream.destroy(err);
  });

  return stream;
}

// ============================================================
// Exports
// ============================================================

module.exports = renderToString;
module.exports.default = renderToString;
module.exports.renderToString = renderToString;
module.exports.renderToStream = renderToStream;
module.exports.renderPage = renderPage;
module.exports.renderPageToStream = renderPageToStream;
module.exports.parseComponent = parseComponent;
module.exports.getHydrationRuntime = getHydrationRuntime;
module.exports.escapeHtml = escapeHtml;
module.exports.escapeAttr = escapeAttr;
module.exports.escapeUrl = escapeUrl;
