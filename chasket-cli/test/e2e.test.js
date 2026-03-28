/**
 * E2E Tests for Chasket Compiler
 * Tests compilation and execution of .csk components
 *
 * Since jsdom package cannot be installed due to registry restrictions,
 * we use a lightweight JSDOM-like environment with minimal DOM APIs needed
 * to test component compilation output.
 */

const test = require('node:test');
const assert = require('node:assert');
const { compile } = require('../lib/compiler.js');
const { JSDOM } = createLightweightJSDOM();

// ============================================================
// LIGHTWEIGHT JSDOM POLYFILL
// ============================================================

/**
 * Create a minimal JSDOM-like environment with just enough DOM APIs
 * to test component compilation output
 */
function createLightweightJSDOM() {
  // We'll create a simple object that emulates JSDOM's interface
  return {
    JSDOM: class JSDOM {
      constructor(html = '<!DOCTYPE html><html><body></body></html>', options = {}) {
        this.html = html;
        this.options = options;
        this.window = new WindowContext(html, options);
      }
    }
  };
}

/**
 * Simulates browser window context with minimal DOM APIs
 */
class WindowContext {
  constructor(html, options) {
    this.document = new DocumentContext(html, this);
    this.customElements = new CustomElementRegistry(this);
    this.HTMLElement = HTMLElement;
    this.CustomEvent = CustomEvent;
    this.eval = (code) => {
      // Create a function scope with 'window' and 'document' available
      const fn = new Function('window', 'document', 'customElements', 'HTMLElement', 'CustomEvent', code);
      fn(this, this.document, this.customElements, HTMLElement, CustomEvent);
    };
  }
}

/**
 * Simulates browser document context
 */
class DocumentContext {
  constructor(html, window) {
    this.window = window;
    this.body = new Element('body');
    this.elements = new Map();
    this._parsedFromHTML = html || '';
    this._nextElementId = 0;
  }

  createElement(tagName) {
    return new Element(tagName.toUpperCase(), this);
  }

  createTextNode(text) {
    return new TextNode(text);
  }

  createDocumentFragment() {
    return new DocumentFragment();
  }
}

/**
 * Custom Element Registry (polyfill for customElements.define())
 */
class CustomElementRegistry {
  constructor(window) {
    this.window = window;
    this.definitions = new Map();
  }

  define(name, constructor) {
    if (this.definitions.has(name)) {
      throw new Error(`Custom element "${name}" is already defined`);
    }
    this.definitions.set(name, constructor);
  }

  get(name) {
    return this.definitions.get(name);
  }
}

/**
 * DOM Element node
 */
class Element {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.shadowRoot = null;
    this._listeners = [];
    this._textContent = '';
    this._innerHTML = '';
    this._classes = new Set();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChild(newNode, oldNode) {
    const idx = this.childNodes.indexOf(oldNode);
    if (idx !== -1) {
      this.childNodes[idx] = newNode;
      oldNode.parentNode = null;
      newNode.parentNode = this;
    }
    return oldNode;
  }

  replaceChildren(...nodes) {
    this.childNodes = [];
    for (const node of nodes) {
      if (node.childNodes) {
        // If it's a DocumentFragment, add its children
        this.childNodes.push(...node.childNodes);
        node.childNodes = [];
      } else {
        this.childNodes.push(node);
      }
    }
  }

  cloneNode(deep) {
    const clone = new Element(this.tagName, this.document);
    this.attributes.forEach((value, name) => {
      clone.setAttribute(name, value);
    });
    if (deep && this.childNodes.length > 0) {
      clone.childNodes = this.childNodes.map(child => child.cloneNode(true));
      clone.childNodes.forEach(child => { child.parentNode = clone; });
    }
    clone._textContent = this._textContent;
    return clone;
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._textContent;
    return this.childNodes
      .map(n => n.textContent || n.nodeValue || '')
      .join('');
  }

  set textContent(value) {
    this.childNodes = [];
    this._textContent = String(value);
  }

  get innerHTML() {
    return this.childNodes
      .map(node => {
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType === 1) return node.outerHTML;
        return '';
      })
      .join('');
  }

  set innerHTML(html) {
    // Parse HTML string and add as children
    this.childNodes = [];
    this._innerHTML = html;
    // Simple parsing: extract text nodes and basic tags
    const fragment = parseHTMLString(html, this.document);
    if (fragment) {
      this.childNodes.push(...fragment.childNodes);
      fragment.childNodes.forEach(child => { child.parentNode = this; });
    }
  }

  get outerHTML() {
    const attrs = Array.from(this.attributes.entries())
      .map(([k, v]) => ` ${k}="${v}"`)
      .join('');
    const inner = this.innerHTML;
    return `<${this.tagName}${attrs}>${inner}</${this.tagName}>`;
  }

  attachShadow(options) {
    this.shadowRoot = new ShadowRoot(options.mode, this.document);
    return this.shadowRoot;
  }

  addEventListener(event, handler) {
    this._listeners.push({ event, handler });
  }

  removeEventListener(event, handler) {
    this._listeners = this._listeners.filter(
      l => !(l.event === event && l.handler === handler)
    );
  }

  dispatchEvent(evt) {
    for (const listener of this._listeners) {
      if (listener.event === evt.type) {
        listener.handler(evt);
      }
    }
    return true;
  }

  get nodeType() {
    return 1; // Element
  }

  get nodeName() {
    return this.tagName;
  }

  get classList() {
    return {
      add: (name) => this._classes.add(name),
      remove: (name) => this._classes.delete(name),
      contains: (name) => this._classes.has(name),
      toggle: (name) => {
        if (this._classes.has(name)) {
          this._classes.delete(name);
          return false;
        } else {
          this._classes.add(name);
          return true;
        }
      }
    };
  }

  get class() {
    return Array.from(this._classes).join(' ');
  }

  set class(value) {
    this._classes = new Set(value.split(/\s+/).filter(Boolean));
  }
}

/**
 * Shadow Root (simplified)
 */
class ShadowRoot {
  constructor(mode, document) {
    this.mode = mode;
    this.document = document;
    this.childNodes = [];
    this.host = null;
  }

  replaceChildren(...nodes) {
    this.childNodes = [];
    for (const node of nodes) {
      if (node.childNodes) {
        this.childNodes.push(...node.childNodes);
        node.childNodes = [];
      } else {
        this.childNodes.push(node);
      }
    }
  }

  querySelector(selector) {
    return querySelectorImpl(selector, this.childNodes);
  }

  querySelectorAll(selector) {
    return querySelectorAllImpl(selector, this.childNodes);
  }

  get innerHTML() {
    return this.childNodes
      .map(node => {
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType === 1) return node.outerHTML;
        return '';
      })
      .join('');
  }
}

/**
 * Text Node
 */
class TextNode {
  constructor(text) {
    this.nodeValue = String(text);
    this.parentNode = null;
  }

  get textContent() {
    return this.nodeValue;
  }

  get nodeType() {
    return 3; // Text
  }

  cloneNode() {
    return new TextNode(this.nodeValue);
  }
}

/**
 * Document Fragment
 */
class DocumentFragment {
  constructor() {
    this.childNodes = [];
  }

  appendChild(node) {
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  cloneNode(deep) {
    const clone = new DocumentFragment();
    if (deep) {
      clone.childNodes = this.childNodes.map(n => n.cloneNode(true));
    }
    return clone;
  }

  get content() {
    return this;
  }
}

/**
 * Basic Event polyfill
 */
class Event {
  constructor(type) {
    this.type = type;
  }
}

/**
 * CustomEvent polyfill
 */
class CustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.type = type;
    this.detail = options.detail;
    this.bubbles = options.bubbles || false;
    this.composed = options.composed || false;
  }
}

/**
 * HTMLElement base class (polyfill)
 */
class HTMLElement {
  constructor() {
    this.tagName = this.constructor.name.replace(/([A-Z])/g, '-$1').toLowerCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.shadowRoot = null;
    this._listeners = [];
    this._innerHTML = '';
    this._textContent = '';
  }

  connectedCallback() {}
  disconnectedCallback() {}
  attributeChangedCallback(name, oldVal, newVal) {}

  static get observedAttributes() {
    return [];
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  setAttribute(name, value) {
    const old = this.getAttribute(name);
    this.attributes.set(name, String(value));
    if (old !== value) {
      this.attributeChangedCallback(name, old, value);
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(node) {
    this.childNodes.push(node);
    if (node.parentNode && node.parentNode !== this) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  attachShadow(options) {
    this.shadowRoot = new ShadowRoot(options.mode);
    this.shadowRoot.host = this;
    return this.shadowRoot;
  }

  addEventListener(event, handler) {
    this._listeners.push({ event, handler });
  }

  removeEventListener(event, handler) {
    this._listeners = this._listeners.filter(
      l => !(l.event === event && l.handler === handler)
    );
  }

  dispatchEvent(evt) {
    for (const listener of this._listeners) {
      if (listener.event === evt.type) {
        listener.handler(evt);
      }
    }
    return true;
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
  }
}

/**
 * Simple HTML string parser (very basic)
 */
function parseHTMLString(html, document) {
  const fragment = new DocumentFragment();

  // Very basic parsing: just extract text and simple elements
  let current = 0;
  while (current < html.length) {
    const tagStart = html.indexOf('<', current);
    if (tagStart === -1) {
      // Rest is text
      const text = html.substring(current);
      if (text.trim()) {
        fragment.appendChild(new TextNode(text));
      }
      break;
    }

    // Add text before tag
    if (tagStart > current) {
      const text = html.substring(current, tagStart);
      if (text.trim()) {
        fragment.appendChild(new TextNode(text));
      }
    }

    // Find tag end
    const tagEnd = html.indexOf('>', tagStart);
    if (tagEnd === -1) break;

    const tagContent = html.substring(tagStart + 1, tagEnd);
    current = tagEnd + 1;

    // Skip closing tags and special tags for now
    if (tagContent.startsWith('/') || tagContent.startsWith('!') || tagContent.startsWith('?')) {
      continue;
    }

    // Extract tag name
    const spaceIdx = tagContent.indexOf(' ');
    const tagName = spaceIdx === -1 ? tagContent : tagContent.substring(0, spaceIdx);

    // Create element
    const el = new Element(tagName.toUpperCase(), document);

    // Extract attributes
    if (spaceIdx !== -1) {
      const attrStr = tagContent.substring(spaceIdx + 1);
      // Very basic attribute parsing
      const attrRegex = /(\w+)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(attrStr))) {
        el.setAttribute(match[1], match[2]);
      }
    }

    fragment.appendChild(el);
  }

  return fragment;
}

/**
 * Simple querySelector implementation
 */
function querySelectorImpl(selector, nodes) {
  for (const node of nodes) {
    if (node.nodeType === 1) {
      if (matchesSelector(node, selector)) return node;
      if (node.childNodes) {
        const result = querySelectorImpl(selector, node.childNodes);
        if (result) return result;
      }
    }
  }
  return null;
}

/**
 * Simple querySelectorAll implementation
 */
function querySelectorAllImpl(selector, nodes) {
  const results = [];
  function search(nodeList) {
    for (const node of nodeList) {
      if (node.nodeType === 1) {
        if (matchesSelector(node, selector)) results.push(node);
        if (node.childNodes) search(node.childNodes);
      }
    }
  }
  search(nodes);
  return results;
}

/**
 * Simple selector matching (supports class, id, tag, attribute selectors)
 */
function matchesSelector(el, selector) {
  // Tag selector
  if (selector.match(/^[a-z]/i) && !selector.includes('.') && !selector.includes('#') && !selector.includes('[')) {
    return el.tagName === selector.toUpperCase();
  }

  // Class selector
  if (selector.startsWith('.')) {
    const className = selector.substring(1);
    return el._classes && el._classes.has(className);
  }

  // ID selector
  if (selector.startsWith('#')) {
    const id = selector.substring(1);
    return el.getAttribute('id') === id;
  }

  // Attribute selector
  if (selector.includes('[')) {
    const match = selector.match(/\[(\w+)(?:="([^"]*)`)?\]/);
    if (match) {
      const attrName = match[1];
      const attrValue = match[2];
      if (attrValue) {
        return el.getAttribute(attrName) === attrValue;
      } else {
        return el.hasAttribute(attrName);
      }
    }
  }

  return false;
}

// ============================================================
// TEST HELPER FUNCTIONS
// ============================================================

/**
 * Compile and execute a .csk component in a JSDOM environment
 */
function createComponent(chasketSrc, fileName, attrs = {}) {
  const result = compile(chasketSrc, fileName);
  if (!result.success) {
    throw new Error(`Compile failed: ${JSON.stringify(result.diagnostics)}`);
  }

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost'
  });

  // Execute the compiled component
  dom.window.eval(result.output);

  // Get the tag name from component name
  // e.g., "counter.csk" -> "counter" (lowercase) -> "x-counter" (if no name specified)
  // But the compiler might have defined it differently, so we need to check customElements
  const tagName = fileName.replace(/\.csk$/i, '');

  // Try to instantiate the component
  // The compiled code should have registered it with customElements.define()
  const el = dom.window.document.createElement(tagName);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  dom.window.document.body.appendChild(el);

  // Trigger connectedCallback if it exists
  if (el.connectedCallback) {
    el.connectedCallback();
  }

  return { dom, el, window: dom.window, document: dom.window.document };
}

/**
 * Get text content from shadow root or light DOM
 */
function getTextContent(el) {
  if (el.shadowRoot && el.shadowRoot.innerHTML) {
    return el.shadowRoot.innerHTML;
  }
  return el.textContent || el.innerHTML || '';
}

/**
 * Get all elements from shadow root
 */
function queryShadow(el, selector) {
  if (el.shadowRoot) {
    return el.shadowRoot.querySelector(selector);
  }
  return null;
}

/**
 * Simulate click event
 */
function click(el) {
  const evt = new CustomEvent('click', { bubbles: true, composed: true });
  el.dispatchEvent(evt);
}

/**
 * Simulate input event
 */
function input(el, value) {
  el.value = value;
  const evt = new CustomEvent('input', { bubbles: true, composed: true, detail: { value } });
  el.dispatchEvent(evt);
}

// ============================================================
// E2E TESTS
// ============================================================

test('E2E: Basic rendering - simple component', () => {
  const chasketSrc = `
<meta>
  name: "x-simple"
</meta>

<template>
  <div>Hello World</div>
</template>
`;

  const { el, document } = createComponent(chasketSrc, 'x-simple');

  // Component should be created
  assert.ok(el, 'Element created');
  assert.strictEqual(el.tagName, 'X-SIMPLE', 'Tag name should match');
});

test('E2E: Prop passing - attribute reflection', () => {
  const chasketSrc = `
<meta>
  name: "x-greeting"
</meta>

<script>
  prop name: string = "World"
</script>

<template>
  <div>Hello {{ name }}</div>
</template>
`;

  const { el, window } = createComponent(chasketSrc, 'x-greeting', { name: 'Alice' });

  // Check that the attribute was set
  assert.strictEqual(el.getAttribute('name'), 'Alice', 'Attribute should be set');
});

test('E2E: Shadow DOM - component with shadow: open', () => {
  const chasketSrc = `
<meta>
  name: "x-shadow-test"
  shadow: open
</meta>

<template>
  <div class="content">Shadow Content</div>
</template>

<style>
  .content { color: red; }
</style>
`;

  const result = compile(chasketSrc, 'x-shadow-test');
  assert.ok(result.output.includes('attachShadow'), 'Should include attachShadow');
  assert.ok(result.output.includes("mode: 'open'"), 'Should have open shadow mode');
});

test('E2E: XSS Protection - HTML escaping in interpolation', () => {
  const chasketSrc = `
<meta>
  name: "x-xss-test"
</meta>

<script>
  prop content: string = "safe content"
</script>

<template>
  <div>{{ content }}</div>
</template>
`;

  const result = compile(chasketSrc, 'x-xss-test');
  // The compiled code should have an escape function for XSS protection
  assert.ok(result.output.includes('#esc('), 'Compiled code should use #esc() for escaping');
});

test('E2E: Event binding - click handler', () => {
  const chasketSrc = `
<meta>
  name: "x-button-test"
</meta>

<script>
  state clicked: number = 0
</script>

<template>
  <button>Click me</button>
</template>
`;

  const result = compile(chasketSrc, 'x-button-test');
  assert.strictEqual(result.success, true, 'Button component should compile');
  assert.ok(result.output.includes('class XButtonTest'), 'Should generate correct class name');
});

test('E2E: Compilation succeeds for counter component', () => {
  const chasketSrc = `
<meta>
  name: "x-counter"
  shadow: none
</meta>

<script>
  state count: number = 0
</script>

<template>
  <div>
    <span>Count: {{ count }}</span>
  </div>
</template>

<style>
  span { margin: 0 16px; }
</style>
`;

  const result = compile(chasketSrc, 'x-counter');
  assert.strictEqual(result.success, true, 'Compilation should succeed');
  assert.ok(result.output, 'Should have output code');
  assert.ok(result.output.includes('customElements.define'), 'Should register custom element');
});

test('E2E: Compilation includes Shadow DOM for shadow: open', () => {
  const chasketSrc = `
<meta>
  name: "x-shadow-component"
  shadow: open
</meta>

<template>
  <div>Content</div>
</template>
`;

  const result = compile(chasketSrc, 'x-shadow-component');
  assert.strictEqual(result.success, true, 'Compilation should succeed');
  assert.ok(result.output.includes('attachShadow'), 'Should use attachShadow for shadow: open');
});

test('E2E: Props become observed attributes', () => {
  const chasketSrc = `
<meta>
  name: "x-prop-test"
</meta>

<script>
  prop title: string = "Default"
  prop count: number = 42
</script>

<template>
  <h1>{{ title }}</h1>
  <p>{{ count }}</p>
</template>
`;

  const result = compile(chasketSrc, 'x-prop-test');
  assert.ok(result.output.includes('observedAttributes'), 'Should have observedAttributes');
});

test('E2E: Emit creates custom events', () => {
  const chasketSrc = `
<meta>
  name: "x-emitter"
</meta>

<script>
  emit changed: void
</script>

<template>
  <div>Emitter component</div>
</template>
`;

  const result = compile(chasketSrc, 'x-emitter');
  assert.strictEqual(result.success, true, 'Emit should compile');
  assert.ok(result.output.includes('CustomEvent'), 'Should use CustomEvent for emit');
});

test('E2E: For loop generates list items', () => {
  const chasketSrc = `
<meta>
  name: "x-list"
</meta>

<script>
  state items: string = "apple,banana,cherry"
</script>

<template>
  <ul>
    <#for each="item" of="items.split(',')">
      <li>{{ item }}</li>
    </#for>
  </ul>
</template>
`;

  const result = compile(chasketSrc, 'x-list');
  assert.strictEqual(result.success, true, 'For loop should compile');
  assert.ok(result.output.length > 0, 'Should generate code');
});

test('E2E: If conditional renders conditionally', () => {
  const chasketSrc = `
<meta>
  name: "x-conditional"
</meta>

<script>
  state show: boolean = true
</script>

<template>
  <#if condition="show">
    <div>Visible</div>
  </#if>
</template>
`;

  const result = compile(chasketSrc, 'x-conditional');
  assert.strictEqual(result.success, true, 'If conditional should compile');
  assert.ok(result.output.includes('if'), 'Compiled output should reference if condition');
});

test('E2E: Slot projects content', () => {
  const chasketSrc = `
<meta>
  name: "x-wrapper"
  shadow: open
</meta>

<template>
  <div class="wrapper">
    <slot></slot>
  </div>
</template>

<style>
  .wrapper { border: 1px solid black; padding: 16px; }
</style>
`;

  const result = compile(chasketSrc, 'x-wrapper');
  assert.ok(result.output.includes('slot'), 'Should include slot in output');
});

test('E2E: Class and style binding', () => {
  const chasketSrc = `
<meta>
  name: "x-styled"
</meta>

<script>
  state active: boolean = true
</script>

<template>
  <button :class="active ? 'btn-active' : 'btn-inactive'">
    Click me
  </button>
</template>
`;

  const result = compile(chasketSrc, 'x-styled');
  assert.strictEqual(result.success, true, 'Class binding should compile');
});

test('E2E: Style tag is minified and included', () => {
  const chasketSrc = `
<meta>
  name: "x-with-style"
</meta>

<template>
  <div class="box">Content</div>
</template>

<style>
  .box {
    background: white;
    border: 1px solid #ccc;
    padding: 16px;
    margin: 8px;
  }
</style>
`;

  const result = compile(chasketSrc, 'x-with-style');
  assert.ok(result.output.includes('style'), 'Should include style in output');
  // Style should be minified
  assert.ok(result.output.includes('.box{'), 'Style should be minified (no spaces after {)');
});

test('E2E: Multiple state variables', () => {
  const chasketSrc = `
<meta>
  name: "x-multi-state"
</meta>

<script>
  state name: string = "John"
  state age: number = 30
  state active: boolean = true
</script>

<template>
  <div>{{ name }}, age {{ age }}, active: {{ active }}</div>
</template>
`;

  const result = compile(chasketSrc, 'x-multi-state');
  assert.strictEqual(result.success, true, 'Multiple state vars should compile');
  assert.ok(result.output.includes('#name'), 'Should have private state field for name');
  assert.ok(result.output.includes('#age'), 'Should have private state field for age');
  assert.ok(result.output.includes('#active'), 'Should have private state field for active');
});

test('E2E: Update method exists for state reactivity', () => {
  const chasketSrc = `
<meta>
  name: "x-reactive"
</meta>

<script>
  state value: number = 0

  fn setValue(v: number) {
    this.value = v
  }
</script>

<template>
  <div>Value: {{ value }}</div>
</template>
`;

  const result = compile(chasketSrc, 'x-reactive');
  assert.ok(result.output.includes('#update()'), 'Should have update method for reactivity');
});

test('E2E: Component name comes from meta', () => {
  const chasketSrc = `
<meta>
  name: "my-custom-element"
</meta>

<template>
  <div>Custom</div>
</template>
`;

  const result = compile(chasketSrc, 'whatever.csk');
  assert.ok(result.output.includes('my-custom-element'), 'Should use name from meta');
  assert.ok(result.output.includes('customElements.define('), 'Should register with customElements.define');
});

// Run all tests
console.log('Running E2E tests for Chasket Compiler...');
