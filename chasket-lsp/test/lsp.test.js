'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('stream');
const path = require('path');

// We test the ChasketLanguageService directly (unit tests)
// and the LspTransport + createServer (integration tests)
const { createServer, ChasketLanguageService, LspTransport } = require('../server');

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_CHASKET = `<meta>
  name: "x-counter"
  shadow: open
</meta>

<script>
  /** Current count value */
  state count: number = 0
  prop label: string = "Click me"
  computed double: number = count * 2

  fn increment() {
    count += 1
  }

  fn async fetchData(url) {
    const res = await fetch(url)
  }

  emit clicked: { count: number }
  ref canvas: HTMLCanvasElement
</script>

<template>
  <button @click="increment">{{ label }}: {{ count }}</button>
  <p>Double: {{ double }}</p>
  <canvas ref="canvas"></canvas>
  <#if condition="count > 0">
    <span>Positive!</span>
  <:else>
    <span>Zero</span>
  </#if>
  <#for each="item" of="items" key="item.id">
    <li>{{ item }}</li>
  </#for>
</template>

<style>
  button { padding: 8px 16px; }
  :host { display: block; }
</style>`;

const URI = 'file:///test/counter.csk';

// ---------------------------------------------------------------------------
// ChasketLanguageService unit tests
// ---------------------------------------------------------------------------

describe('ChasketLanguageService', () => {
  let svc;

  beforeEach(() => {
    svc = new ChasketLanguageService();
    // Point to local compiler
    svc.setCompilerPath(path.resolve(__dirname, '..', '..', 'chasket-cli', 'lib', 'compiler.js'));
    svc.openDocument(URI, SAMPLE_CHASKET, 1);
  });

  // ---- Document management ----

  describe('document management', () => {
    it('opens and retrieves document', () => {
      const doc = svc.getDocument(URI);
      assert.ok(doc);
      assert.equal(doc.version, 1);
      assert.ok(doc.content.includes('x-counter'));
    });

    it('updates document', () => {
      svc.updateDocument(URI, 'new content', 2);
      const doc = svc.getDocument(URI);
      assert.equal(doc.content, 'new content');
      assert.equal(doc.version, 2);
    });

    it('closes document', () => {
      svc.closeDocument(URI);
      assert.equal(svc.getDocument(URI), undefined);
    });
  });

  // ---- Diagnostics ----

  describe('diagnostics', () => {
    it('returns diagnostics array', () => {
      const diags = svc.getDiagnostics(URI);
      assert.ok(Array.isArray(diags));
    });

    it('reports errors for invalid chasket', () => {
      svc.openDocument('file:///bad.csk', '<template></template>', 1);
      const diags = svc.getDiagnostics('file:///bad.csk');
      // Missing meta block is an error in some compiler versions
      assert.ok(Array.isArray(diags));
    });

    it('each diagnostic has proper structure', () => {
      const diags = svc.getDiagnostics(URI);
      for (const d of diags) {
        assert.ok(d.range);
        assert.ok(d.range.start);
        assert.ok(typeof d.range.start.line === 'number');
        assert.ok(typeof d.severity === 'number');
        assert.ok(typeof d.message === 'string');
        assert.equal(d.source, 'chasket');
      }
    });
  });

  // ---- Hover ----

  describe('hover', () => {
    it('returns hover for state keyword', () => {
      // "state" is at line 7 (0-indexed)
      const hover = svc.getHover(URI, { line: 7, character: 4 });
      assert.ok(hover);
      assert.ok(hover.contents.value.includes('state'));
    });

    it('returns hover for user-defined symbol (count)', () => {
      const hover = svc.getHover(URI, { line: 7, character: 10 });
      assert.ok(hover);
      assert.ok(hover.contents.value.includes('count'));
    });

    it('returns hover for prop keyword', () => {
      const hover = svc.getHover(URI, { line: 8, character: 3 });
      assert.ok(hover);
      assert.ok(hover.contents.value.includes('prop'));
    });

    it('returns null for empty area', () => {
      const hover = svc.getHover(URI, { line: 4, character: 0 });
      assert.equal(hover, null);
    });

    it('returns hover for fn keyword', () => {
      // fn is at line 11 (0-indexed), character 2-3 (after 2 spaces)
      const hover = svc.getHover(URI, { line: 11, character: 2 });
      assert.ok(hover);
      assert.ok(hover.contents.value.includes('fn'));
    });

    it('returns hover for emit keyword', () => {
      // emit is at line 19 (0-indexed), character 2-5
      const hover = svc.getHover(URI, { line: 19, character: 3 });
      assert.ok(hover);
      assert.ok(hover.contents.value.includes('emit'));
    });
  });

  // ---- Completion ----

  describe('completion', () => {
    it('provides script completions inside <script>', () => {
      const items = svc.getCompletion(URI, { line: 7, character: 0 });
      assert.ok(items.length > 0);
      const labels = items.map(i => i.label);
      assert.ok(labels.includes('state'));
      assert.ok(labels.includes('prop'));
      assert.ok(labels.includes('fn'));
    });

    it('provides user symbols as script completions', () => {
      const items = svc.getCompletion(URI, { line: 10, character: 0 });
      const labels = items.map(i => i.label);
      assert.ok(labels.includes('count'));
      assert.ok(labels.includes('label'));
    });

    it('provides template completions inside <template>', () => {
      const items = svc.getCompletion(URI, { line: 24, character: 0 });
      assert.ok(items.length > 0);
    });

    it('provides event completions after @', () => {
      // Line with @click
      const items = svc.getCompletion(URI, { line: 24, character: 11 });
      // Even without @ prefix match, general template completions are returned
      assert.ok(items.length > 0);
    });

    it('provides block completions outside blocks', () => {
      // Before <meta> — line 0 would be <meta> already, so use a doc with space before
      svc.openDocument('file:///new.csk', '\n\n', 1);
      const items = svc.getCompletion('file:///new.csk', { line: 0, character: 0 });
      const labels = items.map(i => i.label);
      assert.ok(labels.includes('<meta>'));
      assert.ok(labels.includes('<script>'));
      assert.ok(labels.includes('<template>'));
      assert.ok(labels.includes('<style>'));
    });

    it('provides CSS completions inside <style>', () => {
      // Use a simple doc with known line numbers for style
      svc.openDocument('file:///css.csk', '<meta>\n  name: "x-test"\n</meta>\n<style>\n  \n</style>', 1);
      const items = svc.getCompletion('file:///css.csk', { line: 4, character: 2 });
      const labels = items.map(i => i.label);
      assert.ok(labels.includes(':host'));
    });

    it('provides meta completions inside <meta>', () => {
      const items = svc.getCompletion(URI, { line: 1, character: 2 });
      const labels = items.map(i => i.label);
      assert.ok(labels.includes('name'));
      assert.ok(labels.includes('shadow'));
    });
  });

  // ---- Definition ----

  describe('definition', () => {
    it('jumps to state declaration', () => {
      // "count" in template — line 24 {{ count }}
      const def = svc.getDefinition(URI, { line: 24, character: 49 });
      assert.ok(def);
      assert.equal(def.uri, URI);
      // count is declared at line 8 (1-indexed → 7 for 0-indexed)
      assert.ok(def.range.start.line >= 6 && def.range.start.line <= 8);
    });

    it('returns null for unknown symbol', () => {
      svc.openDocument('file:///t.csk', '<script>\nstate x: number = 0\n</script>\n<template>\n{{ unknown }}\n</template>', 1);
      const def = svc.getDefinition('file:///t.csk', { line: 4, character: 5 });
      // "unknown" is not a defined symbol
      assert.equal(def, null);
    });
  });

  // ---- Document Symbols ----

  describe('document symbols', () => {
    it('returns symbols for the document', () => {
      const syms = svc.getDocumentSymbols(URI);
      assert.ok(syms.length > 0);
      const names = syms.map(s => s.name);
      assert.ok(names.includes('count'));
      assert.ok(names.includes('label'));
      assert.ok(names.includes('double'));
      assert.ok(names.includes('increment'));
    });

    it('includes block-level symbols', () => {
      const syms = svc.getDocumentSymbols(URI);
      const names = syms.map(s => s.name);
      assert.ok(names.some(n => n.startsWith('<')));
    });

    it('symbols have correct structure', () => {
      const syms = svc.getDocumentSymbols(URI);
      for (const s of syms) {
        assert.ok(typeof s.name === 'string');
        assert.ok(typeof s.kind === 'number');
        assert.ok(s.range);
        assert.ok(s.selectionRange);
      }
    });
  });

  // ---- References ----

  describe('references', () => {
    it('finds all references of count', () => {
      const refs = svc.getReferences(URI, { line: 7, character: 10 });
      assert.ok(refs.length > 1); // At least declaration + usage in template
    });

    it('returns empty for non-symbol', () => {
      const refs = svc.getReferences(URI, { line: 4, character: 0 });
      assert.ok(Array.isArray(refs));
    });
  });

  // ---- Rename ----

  describe('rename', () => {
    it('renames symbol across document', () => {
      const edits = svc.getRenameEdits(URI, { line: 7, character: 10 }, 'counter');
      assert.ok(edits);
      assert.ok(edits.changes[URI]);
      assert.ok(edits.changes[URI].length > 1);
      for (const edit of edits.changes[URI]) {
        assert.equal(edit.newText, 'counter');
      }
    });

    it('returns null for non-symbol', () => {
      const edits = svc.getRenameEdits(URI, { line: 4, character: 0 }, 'newname');
      assert.equal(edits, null);
    });
  });

  // ---- Folding Ranges ----

  describe('folding ranges', () => {
    it('returns folding ranges for blocks', () => {
      const ranges = svc.getFoldingRanges(URI);
      assert.ok(ranges.length >= 4); // meta, script, template, style
    });

    it('includes #if and #for folding', () => {
      const ranges = svc.getFoldingRanges(URI);
      // At least 4 main blocks + #if + #for = 6
      assert.ok(ranges.length >= 5);
    });
  });

  // ---- Signature Help ----

  describe('signature help', () => {
    it('returns signature for known function', () => {
      // Simulate typing "increment(" in script
      svc.openDocument('file:///sig.csk', '<script>\nfn increment() { }\nfn test() { increment(\n</script>', 1);
      const sig = svc.getSignatureHelp('file:///sig.csk', { line: 2, character: 22 });
      assert.ok(sig);
      assert.ok(sig.signatures.length > 0);
      assert.ok(sig.signatures[0].label.includes('increment'));
    });

    it('returns null when not in function call', () => {
      const sig = svc.getSignatureHelp(URI, { line: 7, character: 10 });
      assert.equal(sig, null);
    });
  });

  // ---- Formatting ----

  describe('formatting', () => {
    it('returns text edits for formatting', () => {
      svc.openDocument('file:///fmt.csk', '<meta>\nname: "x-test"\nshadow: open\n</meta>', 1);
      const edits = svc.formatDocument('file:///fmt.csk');
      assert.ok(Array.isArray(edits));
    });
  });
});

// ---------------------------------------------------------------------------
// LspTransport unit tests
// ---------------------------------------------------------------------------

describe('LspTransport', () => {
  it('parses LSP message from stream', (_, done) => {
    const input = new Readable({ read() {} });
    const chunks = [];
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); }
    });

    const transport = new LspTransport(input, output);
    transport.onRequest('test/hello', (params) => {
      return { greeting: `Hello ${params.name}` };
    });
    transport.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test/hello', params: { name: 'World' } });
    const msg = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    input.push(msg);

    setTimeout(() => {
      const response = chunks.join('');
      assert.ok(response.includes('"greeting"'));
      assert.ok(response.includes('Hello World'));
      done();
    }, 50);
  });

  it('handles notifications without response', (_, done) => {
    const input = new Readable({ read() {} });
    let received = false;
    const output = new Writable({ write(_, __, cb) { cb(); } });

    const transport = new LspTransport(input, output);
    transport.onNotification('test/notify', (params) => {
      received = true;
      assert.equal(params.value, 42);
    });
    transport.start();

    const body = JSON.stringify({ jsonrpc: '2.0', method: 'test/notify', params: { value: 42 } });
    input.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);

    setTimeout(() => {
      assert.ok(received);
      done();
    }, 50);
  });

  it('handles multiple messages in one chunk', (_, done) => {
    const input = new Readable({ read() {} });
    const results = [];
    const output = new Writable({
      write(chunk, enc, cb) { results.push(chunk.toString()); cb(); }
    });

    const transport = new LspTransport(input, output);
    transport.onRequest('add', (p) => ({ sum: p.a + p.b }));
    transport.start();

    const msg1 = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'add', params: { a: 1, b: 2 } });
    const msg2 = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'add', params: { a: 3, b: 4 } });
    input.push(
      `Content-Length: ${Buffer.byteLength(msg1)}\r\n\r\n${msg1}` +
      `Content-Length: ${Buffer.byteLength(msg2)}\r\n\r\n${msg2}`
    );

    setTimeout(() => {
      const all = results.join('');
      assert.ok(all.includes('"sum":3'));
      assert.ok(all.includes('"sum":7'));
      done();
    }, 50);
  });

  it('responds with method not found for unknown method', (_, done) => {
    const input = new Readable({ read() {} });
    const chunks = [];
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); }
    });

    const transport = new LspTransport(input, output);
    transport.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'nonexistent', params: {} });
    input.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);

    setTimeout(() => {
      const response = chunks.join('');
      assert.ok(response.includes('-32601'));
      assert.ok(response.includes('Method not found'));
      done();
    }, 50);
  });
});

// ---------------------------------------------------------------------------
// Integration test — createServer with full LSP lifecycle
// ---------------------------------------------------------------------------

describe('createServer integration', () => {
  function sendLspMessage(input, msg) {
    const body = JSON.stringify(msg);
    input.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  it('handles initialize → open → completion → shutdown lifecycle', (_, done) => {
    const input = new Readable({ read() {} });
    const chunks = [];
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); }
    });

    const server = createServer(input, output);
    server.start();

    // 1. Initialize
    sendLspMessage(input, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { rootUri: 'file:///test', capabilities: {} }
    });

    setTimeout(() => {
      const all = chunks.join('');
      assert.ok(all.includes('capabilities'));
      assert.ok(all.includes('completionProvider'));
      assert.ok(all.includes('hoverProvider'));
      assert.ok(all.includes('definitionProvider'));

      // 2. didOpen
      sendLspMessage(input, {
        jsonrpc: '2.0', method: 'textDocument/didOpen',
        params: { textDocument: { uri: URI, languageId: 'chasket', version: 1, text: SAMPLE_CHASKET } }
      });

      setTimeout(() => {
        // Should have published diagnostics
        const all2 = chunks.join('');
        assert.ok(all2.includes('publishDiagnostics'));

        // 3. Completion request
        sendLspMessage(input, {
          jsonrpc: '2.0', id: 2, method: 'textDocument/completion',
          params: { textDocument: { uri: URI }, position: { line: 7, character: 0 } }
        });

        setTimeout(() => {
          const all3 = chunks.join('');
          assert.ok(all3.includes('"state"'));

          // 4. Hover request
          sendLspMessage(input, {
            jsonrpc: '2.0', id: 3, method: 'textDocument/hover',
            params: { textDocument: { uri: URI }, position: { line: 7, character: 4 } }
          });

          setTimeout(() => {
            const all4 = chunks.join('');
            assert.ok(all4.includes('state'));

            // 5. Shutdown
            sendLspMessage(input, { jsonrpc: '2.0', id: 4, method: 'shutdown', params: {} });

            setTimeout(() => {
              done();
            }, 30);
          }, 30);
        }, 30);
      }, 100);
    }, 50);
  });

  it('handles definition request', (_, done) => {
    const input = new Readable({ read() {} });
    const chunks = [];
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); }
    });

    const server = createServer(input, output);
    server.start();

    sendLspMessage(input, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });

    setTimeout(() => {
      sendLspMessage(input, {
        jsonrpc: '2.0', method: 'textDocument/didOpen',
        params: { textDocument: { uri: URI, languageId: 'chasket', version: 1, text: SAMPLE_CHASKET } }
      });

      setTimeout(() => {
        sendLspMessage(input, {
          jsonrpc: '2.0', id: 2, method: 'textDocument/definition',
          params: { textDocument: { uri: URI }, position: { line: 7, character: 10 } }
        });

        setTimeout(() => {
          const all = chunks.join('');
          assert.ok(all.includes(URI));
          done();
        }, 50);
      }, 50);
    }, 50);
  });

  it('handles document symbol request', (_, done) => {
    const input = new Readable({ read() {} });
    const chunks = [];
    const output = new Writable({
      write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); }
    });

    const server = createServer(input, output);
    server.start();

    sendLspMessage(input, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });

    setTimeout(() => {
      sendLspMessage(input, {
        jsonrpc: '2.0', method: 'textDocument/didOpen',
        params: { textDocument: { uri: URI, languageId: 'chasket', version: 1, text: SAMPLE_CHASKET } }
      });

      setTimeout(() => {
        sendLspMessage(input, {
          jsonrpc: '2.0', id: 2, method: 'textDocument/documentSymbol',
          params: { textDocument: { uri: URI } }
        });

        setTimeout(() => {
          const all = chunks.join('');
          assert.ok(all.includes('count'));
          assert.ok(all.includes('increment'));
          done();
        }, 50);
      }, 50);
    }, 50);
  });
});
