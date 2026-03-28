'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// LSP Base Protocol — zero-dependency stdio JSON-RPC 2.0 transport
// ---------------------------------------------------------------------------

class LspTransport {
  constructor(input, output) {
    this._input = input;
    this._output = output;
    this._buf = '';
    this._contentLength = -1;
    this._handlers = new Map();
    this._requestHandlers = new Map();
    this._nextId = 1;
    this._pending = new Map();
  }

  onRequest(method, handler) { this._requestHandlers.set(method, handler); }
  onNotification(method, handler) { this._handlers.set(method, handler); }

  start() {
    this._input.setEncoding('utf8');
    this._input.on('data', chunk => this._onData(chunk));
    this._input.on('end', () => process.exit(0));
  }

  _onData(chunk) {
    this._buf += chunk;
    while (true) {
      if (this._contentLength < 0) {
        const idx = this._buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const header = this._buf.slice(0, idx);
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) { this._buf = this._buf.slice(idx + 4); continue; }
        this._contentLength = parseInt(m[1], 10);
        this._buf = this._buf.slice(idx + 4);
      }
      if (Buffer.byteLength(this._buf, 'utf8') < this._contentLength) return;
      // Extract exactly contentLength bytes
      const bodyBuf = Buffer.from(this._buf, 'utf8');
      const body = bodyBuf.slice(0, this._contentLength).toString('utf8');
      this._buf = bodyBuf.slice(this._contentLength).toString('utf8');
      this._contentLength = -1;
      this._dispatch(body);
    }
  }

  _dispatch(body) {
    let msg;
    try { msg = JSON.parse(body); } catch { return; }
    if (msg.id !== undefined && msg.method) {
      // Request
      const handler = this._requestHandlers.get(msg.method);
      if (handler) {
        try {
          const result = handler(msg.params || {});
          if (result && typeof result.then === 'function') {
            result.then(r => this._sendResponse(msg.id, r, null),
                        e => this._sendResponse(msg.id, null, { code: -32603, message: String(e) }));
          } else {
            this._sendResponse(msg.id, result, null);
          }
        } catch (e) {
          this._sendResponse(msg.id, null, { code: -32603, message: String(e) });
        }
      } else {
        this._sendResponse(msg.id, null, { code: -32601, message: `Method not found: ${msg.method}` });
      }
    } else if (msg.id !== undefined) {
      // Response
      const cb = this._pending.get(msg.id);
      if (cb) { this._pending.delete(msg.id); cb(msg); }
    } else {
      // Notification
      const handler = this._handlers.get(msg.method);
      if (handler) {
        try { handler(msg.params || {}); } catch { /* ignore */ }
      }
    }
  }

  _sendResponse(id, result, error) {
    const msg = { jsonrpc: '2.0', id };
    if (error) msg.error = error; else msg.result = result !== undefined ? result : null;
    this._send(msg);
  }

  sendNotification(method, params) {
    this._send({ jsonrpc: '2.0', method, params });
  }

  sendRequest(method, params) {
    const id = this._nextId++;
    return new Promise(resolve => {
      this._pending.set(id, resolve);
      this._send({ jsonrpc: '2.0', id, method, params });
    });
  }

  _send(msg) {
    const json = JSON.stringify(msg);
    const len = Buffer.byteLength(json, 'utf8');
    this._output.write(`Content-Length: ${len}\r\n\r\n${json}`);
  }
}

// ---------------------------------------------------------------------------
// Language Service — wraps the Chasket compiler for IDE features
// ---------------------------------------------------------------------------

class ChasketLanguageService {
  constructor() {
    this._documents = new Map();   // uri → { content, version }
    this._symbolCache = new Map(); // uri → { hash, symbols }
    this._compiler = null;
    this._compilerPath = '';
  }

  setCompilerPath(p) {
    this._compilerPath = p;
    this._compiler = null;
  }

  _getCompiler() {
    if (this._compiler) return this._compiler;
    const tryPaths = [];
    if (this._compilerPath) tryPaths.push(this._compilerPath);
    tryPaths.push(
      path.resolve(__dirname, '..', 'chasket-cli', 'lib', 'compiler.js'),
      'chasket-cli/lib/compiler.js',
    );
    for (const p of tryPaths) {
      try { this._compiler = require(p); return this._compiler; } catch { /* next */ }
    }
    return null;
  }

  // ---- Document management ----

  openDocument(uri, text, version) {
    this._documents.set(uri, { content: text, version });
  }

  updateDocument(uri, text, version) {
    this._documents.set(uri, { content: text, version });
  }

  closeDocument(uri) {
    this._documents.delete(uri);
    this._symbolCache.delete(uri);
  }

  getDocument(uri) { return this._documents.get(uri); }

  // ---- Analysis helpers ----

  _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return h;
  }

  _getSymbols(uri) {
    const doc = this._documents.get(uri);
    if (!doc) return new Map();
    const h = this._hash(doc.content);
    const cached = this._symbolCache.get(uri);
    if (cached && cached.hash === h) return cached.symbols;

    const symbols = new Map();
    const compiler = this._getCompiler();
    if (!compiler) return symbols;

    try {
      const blocks = compiler.splitBlocks(doc.content);
      const scriptBlock = blocks.find(b => b.type === 'script');
      if (!scriptBlock) return symbols;
      const lines = scriptBlock.content.split('\n');
      const startLine = scriptBlock.startLine || 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

        // JSDoc
        let jsdoc = '';
        if (i > 0) {
          const prev = lines[i - 1].trim();
          if (prev.startsWith('/**') && prev.endsWith('*/')) {
            jsdoc = prev.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '').trim();
          }
        }

        let m;
        // state name: type = default
        if ((m = trimmed.match(/^state\s+(\w+)\s*:\s*(\S+)(?:\s*=\s*(.+))?/))) {
          symbols.set(m[1], { kind: 'state', name: m[1], type: m[2], default: m[3] || '', line: startLine + i, jsdoc });
        }
        // prop name: type = default
        else if ((m = trimmed.match(/^prop\s+(\w+)\s*:\s*(\S+)(?:\s*=\s*(.+))?/))) {
          symbols.set(m[1], { kind: 'prop', name: m[1], type: m[2], default: m[3] || '', line: startLine + i, jsdoc });
        }
        // computed name: type = expr
        else if ((m = trimmed.match(/^computed\s+(\w+)\s*:\s*(\S+)\s*=\s*(.+)/))) {
          symbols.set(m[1], { kind: 'computed', name: m[1], type: m[2], expr: m[3], line: startLine + i, jsdoc });
        }
        // ref name: type
        else if ((m = trimmed.match(/^ref\s+(\w+)\s*:\s*(\S+)/))) {
          symbols.set(m[1], { kind: 'ref', name: m[1], type: m[2], line: startLine + i, jsdoc });
        }
        // fn [async] name(...)
        else if ((m = trimmed.match(/^fn\s+(?:async\s+)?(\w+)\s*\(/))) {
          symbols.set(m[1], { kind: 'fn', name: m[1], line: startLine + i, jsdoc, signature: trimmed.split('{')[0].trim() });
        }
        // emit[(opts)] name: type
        else if ((m = trimmed.match(/^emit(?:\([^)]*\))?\s+(\w+)\s*:\s*(.+)/))) {
          symbols.set(m[1], { kind: 'emit', name: m[1], type: m[2].trim(), line: startLine + i, jsdoc });
        }
        // provide name: type = expr
        else if ((m = trimmed.match(/^provide\s+(\w+)\s*:\s*(\S+)/))) {
          symbols.set(m[1], { kind: 'provide', name: m[1], type: m[2], line: startLine + i, jsdoc });
        }
        // consume name: type from tag
        else if ((m = trimmed.match(/^consume\s+(\w+)\s*:\s*(\S+)/))) {
          symbols.set(m[1], { kind: 'consume', name: m[1], type: m[2], line: startLine + i, jsdoc });
        }
      }
    } catch { /* fallback: empty symbols */ }

    this._symbolCache.set(uri, { hash: h, symbols });
    return symbols;
  }

  _getBlocks(uri) {
    const doc = this._documents.get(uri);
    if (!doc) return [];
    const compiler = this._getCompiler();
    if (!compiler) return [];
    try { return compiler.splitBlocks(doc.content); } catch { return []; }
  }

  _positionToOffset(text, line, character) {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    return offset + character;
  }

  _offsetToPosition(text, offset) {
    let line = 0, col = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
      if (text[i] === '\n') { line++; col = 0; } else { col++; }
    }
    return { line, character: col };
  }

  // ---- Diagnostics ----

  getDiagnostics(uri) {
    const doc = this._documents.get(uri);
    if (!doc) return [];
    const compiler = this._getCompiler();
    if (!compiler) return [];

    const diagnostics = [];
    try {
      const result = compiler.compile(doc.content, uriToFileName(uri), { target: 'js' });
      if (result.diagnostics) {
        for (const d of result.diagnostics) {
          const line = (d.line || 1) - 1;
          diagnostics.push({
            range: { start: { line, character: 0 }, end: { line, character: 999 } },
            severity: d.level === 'error' ? 1 : 2,
            code: d.code || '',
            source: 'chasket',
            message: d.message + (d.hint ? `\n💡 ${d.hint}` : ''),
          });
        }
      }
    } catch (e) {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 999 } },
        severity: 1,
        source: 'chasket',
        message: `Compiler error: ${e.message}`,
      });
    }
    return diagnostics;
  }

  // ---- Hover ----

  getHover(uri, position) {
    const doc = this._documents.get(uri);
    if (!doc) return null;

    const line = doc.content.split('\n')[position.line] || '';
    const word = this._wordAt(line, position.character);
    if (!word) return null;

    // Check user-defined symbols
    const symbols = this._getSymbols(uri);
    const sym = symbols.get(word);
    if (sym) {
      return { contents: this._formatSymbolHover(sym) };
    }

    // Check Chasket keywords
    const kw = HOVER_DOCS[word];
    if (kw) {
      return { contents: { kind: 'markdown', value: kw } };
    }

    return null;
  }

  _formatSymbolHover(sym) {
    let md = '';
    switch (sym.kind) {
      case 'state':   md = `\`\`\`chasket\nstate ${sym.name}: ${sym.type}${sym.default ? ` = ${sym.default}` : ''}\n\`\`\``; break;
      case 'prop':    md = `\`\`\`chasket\nprop ${sym.name}: ${sym.type}${sym.default ? ` = ${sym.default}` : ''}\n\`\`\``; break;
      case 'computed':md = `\`\`\`chasket\ncomputed ${sym.name}: ${sym.type} = ${sym.expr || '...'}\n\`\`\``; break;
      case 'fn':      md = `\`\`\`chasket\n${sym.signature || `fn ${sym.name}()`}\n\`\`\``; break;
      case 'emit':    md = `\`\`\`chasket\nemit ${sym.name}: ${sym.type}\n\`\`\``; break;
      case 'ref':     md = `\`\`\`chasket\nref ${sym.name}: ${sym.type}\n\`\`\``; break;
      case 'provide': md = `\`\`\`chasket\nprovide ${sym.name}: ${sym.type}\n\`\`\``; break;
      case 'consume': md = `\`\`\`chasket\nconsume ${sym.name}: ${sym.type}\n\`\`\``; break;
      default:        md = `\`${sym.name}\``;
    }
    if (sym.jsdoc) md += `\n\n${sym.jsdoc}`;
    return { kind: 'markdown', value: md };
  }

  _wordAt(line, col) {
    const left = line.slice(0, col + 1).search(/[\w]+$/);
    if (left < 0) return '';
    const right = line.slice(col).search(/[^\w]/);
    const end = right < 0 ? line.length : col + right;
    return line.slice(left, end);
  }

  // ---- Completion ----

  getCompletion(uri, position) {
    const doc = this._documents.get(uri);
    if (!doc) return [];

    const lines = doc.content.split('\n');
    const line = lines[position.line] || '';
    const prefix = line.slice(0, position.character);
    const items = [];

    // Determine which block we're in
    const block = this._blockAtLine(uri, position.line);

    if (block === 'script') {
      items.push(...SCRIPT_COMPLETIONS);

      // Add user symbols as completions
      const symbols = this._getSymbols(uri);
      for (const [name, sym] of symbols) {
        items.push({
          label: name,
          kind: sym.kind === 'fn' ? 3 : 6,  // Function : Variable
          detail: `${sym.kind}: ${sym.type || ''}`,
          documentation: sym.jsdoc || '',
          insertText: name,
        });
      }
    } else if (block === 'template') {
      // Event handlers (@)
      if (prefix.match(/@\w*$/)) {
        items.push(...EVENT_COMPLETIONS);
      }
      // Dynamic attributes (:)
      else if (prefix.match(/:\w*$/)) {
        items.push(...ATTR_COMPLETIONS);
      }
      // Interpolation {{ }}
      else if (prefix.match(/\{\{\s*\w*$/)) {
        const symbols = this._getSymbols(uri);
        for (const [name, sym] of symbols) {
          if (sym.kind !== 'fn' && sym.kind !== 'emit') {
            items.push({
              label: name,
              kind: 6,
              detail: `${sym.kind}: ${sym.type || ''}`,
              insertText: name,
            });
          }
        }
      }
      // HTML tags
      else if (prefix.match(/<\w*$/)) {
        items.push(...TAG_COMPLETIONS);
      }
      else {
        // General template completions
        items.push(...TEMPLATE_GENERAL_COMPLETIONS);
        const symbols = this._getSymbols(uri);
        for (const [name, sym] of symbols) {
          items.push({
            label: name,
            kind: sym.kind === 'fn' ? 3 : 6,
            detail: `${sym.kind}: ${sym.type || ''}`,
            insertText: name,
          });
        }
      }
    } else if (block === 'style') {
      items.push(...CSS_COMPLETIONS);
    } else if (block === 'meta') {
      items.push(...META_COMPLETIONS);
    } else {
      // Outside blocks — block snippets
      items.push(...BLOCK_COMPLETIONS);
    }

    return items;
  }

  _blockAtLine(uri, line) {
    const doc = this._documents.get(uri);
    if (!doc) return null;
    const lines = doc.content.split('\n');
    let current = null;
    for (let i = 0; i <= line && i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.match(/^<meta(\s|>)/)) current = 'meta';
      else if (t.match(/^<script(\s|>)/)) current = 'script';
      else if (t.match(/^<template(\s|>)/)) current = 'template';
      else if (t.match(/^<style(\s|>)/)) current = 'style';
      else if (t.match(/^<\/(meta|script|template|style)>/)) current = null;
    }
    return current;
  }

  // ---- Go to Definition ----

  getDefinition(uri, position) {
    const doc = this._documents.get(uri);
    if (!doc) return null;

    const line = doc.content.split('\n')[position.line] || '';
    const word = this._wordAt(line, position.character);
    if (!word) return null;

    const symbols = this._getSymbols(uri);
    const sym = symbols.get(word);
    if (!sym) return null;

    const targetLine = sym.line - 1;
    return {
      uri,
      range: {
        start: { line: targetLine, character: 0 },
        end: { line: targetLine, character: 999 },
      },
    };
  }

  // ---- Document Symbols (Outline) ----

  getDocumentSymbols(uri) {
    const symbols = this._getSymbols(uri);
    const result = [];
    const kindMap = {
      state: 13,    // Variable
      prop: 7,      // Property
      computed: 7,  // Property
      fn: 12,       // Function
      emit: 24,     // Event
      ref: 8,       // Field
      provide: 13,  // Variable
      consume: 13,  // Variable
    };

    for (const [name, sym] of symbols) {
      const line = sym.line - 1;
      result.push({
        name,
        kind: kindMap[sym.kind] || 13,
        range: { start: { line, character: 0 }, end: { line, character: 999 } },
        selectionRange: { start: { line, character: 0 }, end: { line, character: name.length } },
        detail: sym.type || sym.kind,
      });
    }

    // Add block-level symbols
    const blocks = this._getBlocks(uri);
    for (const b of blocks) {
      const line = (b.startLine || 1) - 1;
      result.push({
        name: `<${b.type}>`,
        kind: 2,  // Module
        range: { start: { line, character: 0 }, end: { line, character: 999 } },
        selectionRange: { start: { line, character: 0 }, end: { line, character: b.type.length + 2 } },
      });
    }

    return result;
  }

  // ---- References ----

  getReferences(uri, position) {
    const doc = this._documents.get(uri);
    if (!doc) return [];

    const line = doc.content.split('\n')[position.line] || '';
    const word = this._wordAt(line, position.character);
    if (!word) return [];

    const symbols = this._getSymbols(uri);
    if (!symbols.has(word)) return [];

    // Find all occurrences in the document
    const refs = [];
    const lines = doc.content.split('\n');
    const wordRe = new RegExp(`\\b${word}\\b`, 'g');
    for (let i = 0; i < lines.length; i++) {
      let m;
      while ((m = wordRe.exec(lines[i])) !== null) {
        refs.push({
          uri,
          range: {
            start: { line: i, character: m.index },
            end: { line: i, character: m.index + word.length },
          },
        });
      }
    }
    return refs;
  }

  // ---- Rename ----

  getRenameEdits(uri, position, newName) {
    const refs = this.getReferences(uri, position);
    if (refs.length === 0) return null;
    const changes = {};
    changes[uri] = refs.map(r => ({ range: r.range, newText: newName }));
    return { changes };
  }

  // ---- Folding Ranges ----

  getFoldingRanges(uri) {
    const doc = this._documents.get(uri);
    if (!doc) return [];

    const lines = doc.content.split('\n');
    const ranges = [];
    const stack = [];

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.match(/^<(meta|script|template|style)(\s|>)/)) {
        stack.push({ kind: 'region', start: i });
      } else if (t.match(/^<\/(meta|script|template|style)>/)) {
        const top = stack.pop();
        if (top) ranges.push({ startLine: top.start, endLine: i, kind: 'region' });
      } else if (t.startsWith('<#if') || t.startsWith('<#for')) {
        stack.push({ kind: 'region', start: i });
      } else if (t.startsWith('</#if>') || t.startsWith('</#for>')) {
        const top = stack.pop();
        if (top) ranges.push({ startLine: top.start, endLine: i, kind: 'region' });
      }
    }
    return ranges;
  }

  // ---- Signature Help ----

  getSignatureHelp(uri, position) {
    const doc = this._documents.get(uri);
    if (!doc) return null;

    const line = doc.content.split('\n')[position.line] || '';
    const before = line.slice(0, position.character);
    // Look for function call pattern: name(
    const m = before.match(/(\w+)\s*\(\s*[^)]*$/);
    if (!m) return null;

    const symbols = this._getSymbols(uri);
    const sym = symbols.get(m[1]);
    if (!sym || sym.kind !== 'fn') return null;

    return {
      signatures: [{
        label: sym.signature || `fn ${sym.name}()`,
        documentation: sym.jsdoc || '',
        parameters: [],
      }],
      activeSignature: 0,
      activeParameter: 0,
    };
  }

  // ---- Code Actions (Quick Fixes) ----

  getCodeActions(uri, range, diagnostics) {
    const actions = [];
    for (const d of diagnostics) {
      // Offer "did you mean X?" quick fix for typos
      if (d.message && d.message.includes('もしかして:')) {
        const m = d.message.match(/もしかして:\s*(\w+)/);
        if (m) {
          actions.push({
            title: `'${m[1]}' に修正`,
            kind: 'quickfix',
            diagnostics: [d],
            edit: {
              changes: {
                [uri]: [{
                  range: d.range,
                  newText: '', // Would need the full line context
                }],
              },
            },
          });
        }
      }
    }
    return actions;
  }

  // ---- Formatting ----

  formatDocument(uri) {
    const doc = this._documents.get(uri);
    if (!doc) return [];

    const lines = doc.content.split('\n');
    const edits = [];
    let indent = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      // Decrease indent for closing tags
      if (trimmed.match(/^<\/(meta|script|template|style)>/) ||
          trimmed.match(/^<\/(#if|#for)>/) ||
          trimmed.match(/^<:(else|else-if|empty)/)) {
        indent = Math.max(0, indent - 1);
      }

      const expected = '  '.repeat(indent) + trimmed;
      if (lines[i] !== expected) {
        edits.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i].length } },
          newText: expected,
        });
      }

      // Increase indent for opening tags
      if (trimmed.match(/^<(meta|script|template|style)(\s|>)/) && !trimmed.match(/<\/\w+>$/)) {
        indent++;
      } else if (trimmed.match(/^<#(if|for)\b/) && !trimmed.match(/<\/#/)) {
        indent++;
      } else if (trimmed.match(/^<:(else|else-if|empty)/)) {
        indent++;
      }
    }
    return edits;
  }
}

// ---------------------------------------------------------------------------
// Completion item definitions
// ---------------------------------------------------------------------------

const SCRIPT_COMPLETIONS = [
  { label: 'state', kind: 14, detail: 'Reactive variable', insertText: 'state ${1:name}: ${2:string} = ${3:""}', insertTextFormat: 2 },
  { label: 'prop', kind: 14, detail: 'External attribute', insertText: 'prop ${1:name}: ${2:string} = ${3:""}', insertTextFormat: 2 },
  { label: 'computed', kind: 14, detail: 'Derived value', insertText: 'computed ${1:name}: ${2:number} = ${3:expression}', insertTextFormat: 2 },
  { label: 'fn', kind: 14, detail: 'Method', insertText: 'fn ${1:name}(${2}) {\n  ${3}\n}', insertTextFormat: 2 },
  { label: 'fn async', kind: 14, detail: 'Async method', insertText: 'fn async ${1:name}(${2}) {\n  ${3}\n}', insertTextFormat: 2 },
  { label: 'emit', kind: 14, detail: 'Custom event', insertText: 'emit ${1:name}: ${2:void}', insertTextFormat: 2 },
  { label: 'ref', kind: 14, detail: 'DOM reference', insertText: 'ref ${1:name}: ${2:HTMLElement}', insertTextFormat: 2 },
  { label: 'watch', kind: 14, detail: 'Side effect', insertText: 'watch(${1:dep}) {\n  ${2}\n}', insertTextFormat: 2 },
  { label: 'on mount', kind: 14, detail: 'Connected callback', insertText: 'on mount {\n  ${1}\n}', insertTextFormat: 2 },
  { label: 'on unmount', kind: 14, detail: 'Disconnected callback', insertText: 'on unmount {\n  ${1}\n}', insertTextFormat: 2 },
  { label: 'on error', kind: 14, detail: 'Error boundary', insertText: 'on error {\n  ${1}\n}', insertTextFormat: 2 },
  { label: 'provide', kind: 14, detail: 'Context provide', insertText: 'provide ${1:name}: ${2:string} = ${3:""}', insertTextFormat: 2 },
  { label: 'consume', kind: 14, detail: 'Context consume', insertText: 'consume ${1:name}: ${2:string} from ${3:tag}', insertTextFormat: 2 },
  { label: 'import', kind: 14, detail: 'ES module import', insertText: 'import ${1:name} from "${2:module}"', insertTextFormat: 2 },
];

const EVENT_COMPLETIONS = [
  { label: '@click', kind: 23, insertText: '@click="${1:handler}"', insertTextFormat: 2 },
  { label: '@input', kind: 23, insertText: '@input="${1:handler}"', insertTextFormat: 2 },
  { label: '@change', kind: 23, insertText: '@change="${1:handler}"', insertTextFormat: 2 },
  { label: '@submit', kind: 23, insertText: '@submit|prevent="${1:handler}"', insertTextFormat: 2 },
  { label: '@keydown', kind: 23, insertText: '@keydown|${1:enter}="${2:handler}"', insertTextFormat: 2 },
  { label: '@keyup', kind: 23, insertText: '@keyup="${1:handler}"', insertTextFormat: 2 },
  { label: '@focus', kind: 23, insertText: '@focus="${1:handler}"', insertTextFormat: 2 },
  { label: '@blur', kind: 23, insertText: '@blur="${1:handler}"', insertTextFormat: 2 },
  { label: '@mouseenter', kind: 23, insertText: '@mouseenter="${1:handler}"', insertTextFormat: 2 },
  { label: '@mouseleave', kind: 23, insertText: '@mouseleave="${1:handler}"', insertTextFormat: 2 },
  { label: '@dblclick', kind: 23, insertText: '@dblclick="${1:handler}"', insertTextFormat: 2 },
];

const ATTR_COMPLETIONS = [
  { label: ':class', kind: 5, insertText: ':class="${1:expr}"', insertTextFormat: 2 },
  { label: ':style', kind: 5, insertText: ':style="${1:expr}"', insertTextFormat: 2 },
  { label: ':src', kind: 5, insertText: ':src="${1:url}"', insertTextFormat: 2 },
  { label: ':href', kind: 5, insertText: ':href="${1:url}"', insertTextFormat: 2 },
  { label: ':id', kind: 5, insertText: ':id="${1:expr}"', insertTextFormat: 2 },
  { label: ':value', kind: 5, insertText: ':value="${1:expr}"', insertTextFormat: 2 },
  { label: ':disabled', kind: 5, insertText: ':disabled="${1:expr}"', insertTextFormat: 2 },
  { label: ':hidden', kind: 5, insertText: ':hidden="${1:expr}"', insertTextFormat: 2 },
  { label: ':checked', kind: 5, insertText: ':checked="${1:expr}"', insertTextFormat: 2 },
  { label: ':bind', kind: 5, detail: 'Two-way binding', insertText: ':bind="${1:state}"', insertTextFormat: 2 },
  { label: ':placeholder', kind: 5, insertText: ':placeholder="${1:expr}"', insertTextFormat: 2 },
  { label: ':aria-label', kind: 5, insertText: ':aria-label="${1:expr}"', insertTextFormat: 2 },
  { label: ':data-', kind: 5, insertText: ':data-${1:name}="${2:expr}"', insertTextFormat: 2 },
];

const TAG_COMPLETIONS = [
  { label: '#if', kind: 14, detail: 'Conditional block', insertText: '#if condition="${1:expr}">\n  ${2}\n</#if', insertTextFormat: 2 },
  { label: '#for', kind: 14, detail: 'Loop block', insertText: '#for each="${1:item}" of="${2:items}" key="${3:item.id}">\n  ${4}\n</#for', insertTextFormat: 2 },
  { label: 'slot', kind: 14, detail: 'Web Component slot', insertText: 'slot name="${1:default}">${2}</slot', insertTextFormat: 2 },
];

const TEMPLATE_GENERAL_COMPLETIONS = [
  { label: '{{ }}', kind: 15, detail: 'Interpolation', insertText: '{{ ${1:expression} }}', insertTextFormat: 2 },
  { label: '@html', kind: 14, detail: 'Raw HTML (unescaped)', insertText: '@html="${1:expr}"', insertTextFormat: 2 },
];

const CSS_COMPLETIONS = [
  { label: ':host', kind: 14, detail: 'Shadow DOM host selector', insertText: ':host {\n  ${1}\n}', insertTextFormat: 2 },
  { label: ':host()', kind: 14, detail: 'Conditional host', insertText: ':host(${1:.class}) {\n  ${2}\n}', insertTextFormat: 2 },
  { label: '::slotted()', kind: 14, detail: 'Slotted content', insertText: '::slotted(${1:*}) {\n  ${2}\n}', insertTextFormat: 2 },
];

const META_COMPLETIONS = [
  { label: 'name', kind: 5, detail: 'Component tag name', insertText: 'name: "${1:x-component}"', insertTextFormat: 2 },
  { label: 'shadow', kind: 5, detail: 'Shadow DOM mode', insertText: 'shadow: ${1|open,closed,none|}', insertTextFormat: 2 },
  { label: 'form', kind: 5, detail: 'Form-associated CE', insertText: 'form: true', insertTextFormat: 2 },
];

const BLOCK_COMPLETIONS = [
  { label: '<meta>', kind: 15, detail: 'Meta block', insertText: '<meta>\n  name: "${1:x-component}"\n  shadow: ${2:open}\n</meta>\n', insertTextFormat: 2 },
  { label: '<script>', kind: 15, detail: 'Script block', insertText: '<script>\n  ${1}\n</script>\n', insertTextFormat: 2 },
  { label: '<template>', kind: 15, detail: 'Template block', insertText: '<template>\n  ${1}\n</template>\n', insertTextFormat: 2 },
  { label: '<style>', kind: 15, detail: 'Style block', insertText: '<style>\n  ${1}\n</style>\n', insertTextFormat: 2 },
];

// ---------------------------------------------------------------------------
// Hover documentation for Chasket keywords
// ---------------------------------------------------------------------------

const HOVER_DOCS = {
  state: '**state** — リアクティブ変数。変更時にDOMが自動更新されます。\n\n```chasket\nstate count: number = 0\n```',
  prop: '**prop** — 外部から渡される属性。HTML属性として設定できます。\n\n```chasket\nprop label: string = "default"\n```',
  computed: '**computed** — 他の値から自動計算される読み取り専用値。\n\n```chasket\ncomputed total: number = price * quantity\n```',
  fn: '**fn** — メソッド定義。DOM更新を自動でトリガーします。\n\n```chasket\nfn increment() { count += 1 }\nfn async fetchData() { ... }\n```',
  emit: '**emit** — カスタムイベント。親コンポーネントに通知を送ります。\n\n```chasket\nemit close: { reason: string }\nemit(local) internal: void\n```',
  ref: '**ref** — DOM要素への参照。`ref="name"` 属性で紐付けます。\n\n```chasket\nref canvas: HTMLCanvasElement\n```',
  watch: '**watch** — 依存値の変更時に副作用を実行します。\n\n```chasket\nwatch(count) { console.log("count changed:", count) }\n```',
  provide: '**provide** — 子孫コンポーネントにコンテキストを提供します。\n\n```chasket\nprovide theme: string = "dark"\n```',
  consume: '**consume** — 祖先コンポーネントからコンテキストを受け取ります。\n\n```chasket\nconsume theme: string from x-app\n```',
  shadow: '**shadow** — Shadow DOMモード。`open`, `closed`, `none` から選択。',
  slot: '**slot** — Web Componentsのスロット。子コンテンツの差し込み口です。',
  import: '**import** — ESモジュールのインポート文。',
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function uriToFileName(uri) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace('file://', ''));
  }
  return uri;
}

// ---------------------------------------------------------------------------
// Server factory — wire transport + language service + LSP protocol
// ---------------------------------------------------------------------------

function createServer(input, output) {
  const transport = new LspTransport(input, output);
  const service = new ChasketLanguageService();
  let capabilities = {};

  // Initialize
  transport.onRequest('initialize', (params) => {
    if (params.initializationOptions && params.initializationOptions.compilerPath) {
      service.setCompilerPath(params.initializationOptions.compilerPath);
    }
    if (params.rootUri) {
      const root = uriToFileName(params.rootUri);
      // Try to find compiler relative to workspace
      const localCompiler = path.join(root, 'chasket-cli', 'lib', 'compiler.js');
      try { require.resolve(localCompiler); service.setCompilerPath(localCompiler); } catch { /* skip */ }
    }

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 1, // Full
          save: { includeText: true },
        },
        completionProvider: {
          triggerCharacters: ['<', ':', '@', '{', '.', '"', "'", ' '],
          resolveProvider: false,
        },
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        renameProvider: { prepareProvider: false },
        foldingRangeProvider: true,
        signatureHelpProvider: {
          triggerCharacters: ['(', ','],
        },
        codeActionProvider: true,
        documentFormattingProvider: true,
      },
    };
  });

  transport.onNotification('initialized', () => {
    // Client ready — nothing special needed
  });

  // Document sync
  transport.onNotification('textDocument/didOpen', (params) => {
    const { uri, text, version } = params.textDocument;
    service.openDocument(uri, text, version);
    publishDiagnostics(uri);
  });

  transport.onNotification('textDocument/didChange', (params) => {
    const { uri, version } = params.textDocument;
    const text = params.contentChanges[0]?.text;
    if (text !== undefined) {
      service.updateDocument(uri, text, version);
      scheduleDiagnostics(uri);
    }
  });

  transport.onNotification('textDocument/didSave', (params) => {
    const uri = params.textDocument.uri;
    if (params.text !== undefined) {
      service.updateDocument(uri, params.text, undefined);
    }
    publishDiagnostics(uri);
  });

  transport.onNotification('textDocument/didClose', (params) => {
    const uri = params.textDocument.uri;
    service.closeDocument(uri);
    // Clear diagnostics
    transport.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] });
  });

  // Completion
  transport.onRequest('textDocument/completion', (params) => {
    return service.getCompletion(params.textDocument.uri, params.position);
  });

  // Hover
  transport.onRequest('textDocument/hover', (params) => {
    return service.getHover(params.textDocument.uri, params.position);
  });

  // Definition
  transport.onRequest('textDocument/definition', (params) => {
    return service.getDefinition(params.textDocument.uri, params.position);
  });

  // References
  transport.onRequest('textDocument/references', (params) => {
    return service.getReferences(params.textDocument.uri, params.position);
  });

  // Document Symbols
  transport.onRequest('textDocument/documentSymbol', (params) => {
    return service.getDocumentSymbols(params.textDocument.uri);
  });

  // Rename
  transport.onRequest('textDocument/rename', (params) => {
    return service.getRenameEdits(params.textDocument.uri, params.position, params.newName);
  });

  // Folding
  transport.onRequest('textDocument/foldingRange', (params) => {
    return service.getFoldingRanges(params.textDocument.uri);
  });

  // Signature Help
  transport.onRequest('textDocument/signatureHelp', (params) => {
    return service.getSignatureHelp(params.textDocument.uri, params.position);
  });

  // Code Actions
  transport.onRequest('textDocument/codeAction', (params) => {
    return service.getCodeActions(params.textDocument.uri, params.range, params.context?.diagnostics || []);
  });

  // Formatting
  transport.onRequest('textDocument/formatting', (params) => {
    return service.formatDocument(params.textDocument.uri);
  });

  // Shutdown
  transport.onRequest('shutdown', () => null);
  transport.onNotification('exit', () => process.exit(0));

  // Debounced diagnostics
  const diagTimers = new Map();
  function scheduleDiagnostics(uri) {
    const existing = diagTimers.get(uri);
    if (existing) clearTimeout(existing);
    diagTimers.set(uri, setTimeout(() => {
      diagTimers.delete(uri);
      publishDiagnostics(uri);
    }, 300));
  }

  function publishDiagnostics(uri) {
    const diagnostics = service.getDiagnostics(uri);
    transport.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics });
  }

  return {
    start: () => transport.start(),
    transport,
    service,
  };
}

module.exports = { createServer, ChasketLanguageService, LspTransport };
