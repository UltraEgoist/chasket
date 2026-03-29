/**
 * Chasket Compiler Core Library
 *
 * Compiles .csk files (Chasket component definitions) to Web Components.
 *
 * ARCHITECTURE:
 * This compiler implements a 5-phase pipeline:
 *
 * Phase 1 (Split):       Extract <meta>, <script>, <template>, <style> blocks from source
 * Phase 2 (Parse):       Parse each block:
 *                        - Script: state, prop, computed, fn, emit, ref, watch, provide, consume, lifecycle, import, type declarations
 *                        - Template: Recursive HTML parser with support for {{}} interpolation, <#if>, <#for>
 *                        - Meta: Key-value pairs (name, shadow, form, extends)
 *                        - Style: CSS (minified during code generation)
 * Phase 3 (Type Check):  Build symbol table, validate types, check template variable references
 * Phase 4 (Code Generate): Transform AST to Web Component class with event binding system
 * Phase 5 (Output):      Return compiled JS (or TS with .d.ts declarations)
 *
 * KEY PATTERNS:
 * - txSafe(expr, replacements): String-aware identifier replacement (avoids replacing inside string literals)
 * - data-chasket-id: Unique event binding targets in template (supports dynamic IDs in loops)
 * - Private fields (#name): All internal state/methods are private to prevent external access
 *
 * @author Chasket Team
 * @version 1.0.0
 */

// ============================================================
// I18n Support
// ============================================================

const { msg } = require('./messages');
const __chasketVersion = require('../package.json').version;

// ============================================================
// PHASE 1: Block Splitter
// ============================================================

/**
 * Phase 1: Split source file into semantic blocks.
 *
 * Extracts <meta>, <script>, <template>, <style> blocks using regex.
 * Normalizes line breaks and tracks line numbers for diagnostics.
 *
 * @param {string} source - Raw .csk file content
 * @returns {Array<{type: string, content: string, startLine: number}>} Extracted blocks
 * @description
 * この関数は .csk ファイルをセマンティックブロックに分割します。
 * 各ブロックには開始行番号が記録され、エラー診断に使用されます。
 */
function splitBlocks(source) {
  // Normalize CRLF (Windows) and CR (old Mac) line breaks to LF (Unix)
  source = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = [];
  // Regex captures: (1) block type, (2) attributes (optional), (3) block content
  // Using [\s\S]*? for non-greedy any-character matching (including newlines)
  const re = /<(meta|script|template|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    blocks.push({
      type: m[1],         // Block type: 'meta', 'script', 'template', or 'style'
      content: m[3],      // Block content (everything between opening and closing tags)
      startLine: source.substring(0, m.index).split('\n').length,  // 1-indexed line number
    });
  }
  return blocks;
}

// ─── Helper: Smart comma split that respects bracket nesting ───

/**
 * Split a string by commas, but only at depth 0 (respecting brackets and quotes).
 *
 * Used to parse type parameters and function arguments where commas inside
 * brackets (e.g., `string | number, Record<string, number>`) should not split.
 *
 * @param {string} s - String to split
 * @returns {string[]} Array of parts, trimmed
 * @example
 * smartSplit("string, number | boolean") // ["string", "number | boolean"]
 * smartSplit("Record<string, number>, Array") // ["Record<string, number>", "Array"]
 */
function smartSplit(s) {
  const parts = [];
  let current = '';
  let depth = 0;  // Tracks nesting depth of brackets
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // Increment depth for opening brackets (only if not inside string)
    if ((ch === '{' || ch === '[') && !isInString(s, i)) depth++;
    // Decrement depth for closing brackets (only if not inside string)
    else if ((ch === '}' || ch === ']') && !isInString(s, i)) depth--;
    // Split on commas at depth 0 (only if not inside string)
    else if (ch === ',' && depth === 0 && !isInString(s, i)) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Check if a position in a string is inside a string literal.
 *
 * Walks forward through the string tracking quote state.
 * Handles escaped quotes (\'', \", \`).
 * This is a linear scan and used by smartSplit and other parsing functions.
 *
 * @param {string} s - String to scan
 * @param {number} pos - Position to check
 * @returns {boolean} True if position is inside a quoted string
 * @description
 * この関数は単純な線形スキャンで引用符の状態を追跡します。
 * バックスラッシュでエスケープされた引用符は無視されます。
 */
function isInString(s, pos) {
  let inStr = false,      // Are we currently inside a string?
      strChar = '';        // Which quote character opened the current string?
  for (let i = 0; i < pos; i++) {
    // S-07: Skip escaped characters properly (handle \\", \\\", etc.)
    if (s[i] === '\\' && inStr) {
      i++; // Skip next character entirely (it's escaped)
      continue;
    }
    // Check for quote characters
    if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
      if (!inStr) {
        // Entering a string
        inStr = true;
        strChar = s[i];
      }
      else if (s[i] === strChar) {
        // Exiting a string (matching quote found)
        inStr = false;
      }
    }
  }
  return inStr;
}

/**
 * Extract primitive type name from a type object.
 *
 * Returns null for complex types (union, array, object) since those
 * don't have a single primitive name. Used when determining default values
 * for props and coercion functions.
 *
 * @param {Object} t - Type object with {kind, name} properties
 * @returns {string|null} Primitive name ('string', 'number', 'boolean', etc.) or null
 * @example
 * typeName({kind: 'primitive', name: 'number'}) // 'number'
 * typeName({kind: 'array', element: {...}})     // null
 */
function typeName(t) {
  if (!t) return null;
  if (t.kind === 'primitive' && t.name) return t.name;
  return null;
}

// ============================================================
// Type Parser
// ============================================================

/**
 * Parse a type string into an internal type AST.
 *
 * Supports:
 * - Primitives: string, number, boolean, void, null, undefined
 * - Arrays: string[], number[][], etc. (recursive)
 * - Union types: string | number | boolean
 * - Literal types: "value" (string literal)
 * - Object types: {name: string, age: number, email?: string}
 *
 * Implements recursion depth limit (max 20) to prevent stack overflow
 * on malformed types.
 *
 * @param {string} raw - Raw type string to parse
 * @param {number} [depth=0] - Current recursion depth (internal use)
 * @returns {Object} Type AST: {kind, name|element|types|value|fields}
 * @description
 * この関数は型文字列を内部表現に変換します。
 * 深さ制限により、無限再帰による無限ループを防ぎます。
 */
/**
 * Check if position `pos` in string `s` is inside angle brackets <...>.
 */
function isInsideAngleBrackets(s, pos) {
  let depth = 0;
  for (let i = 0; i < pos; i++) {
    if (s[i] === '<') depth++;
    else if (s[i] === '>') depth--;
  }
  return depth > 0;
}

/**
 * Split a type string by a delimiter at the top level only
 * (not inside < >, { }, or ( )).
 *
 * @param {string} s - Type string
 * @param {string} delim - Single-character delimiter ('|' or ',')
 * @returns {string[]}
 */
function splitTopLevel(s, delim) {
  const parts = [];
  let current = '';
  let angleDepth = 0, braceDepth = 0, parenDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;

    if (ch === delim && angleDepth === 0 && braceDepth === 0 && parenDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseType(raw, depth = 0) {
  // Safety: prevent stack overflow on malformed types with high nesting
  if (depth > 20) return { kind: 'primitive', name: 'any' };

  const s = raw.trim();

  // Handle array types: string[] -> {kind: 'array', element: {kind: 'primitive', name: 'string'}}
  if (s.endsWith('[]')) return { kind: 'array', element: parseType(s.slice(0, -2), depth + 1) };

  // Handle union types: string | number -> {kind: 'union', types: [...]}
  // Must check that '|' is not inside angle brackets (generic params)
  if (s.includes('|') && !isInsideAngleBrackets(s, s.indexOf('|'))) {
    // Split on '|' only at top level (not inside < >)
    const parts = splitTopLevel(s, '|');
    if (parts.length > 1) {
      return { kind: 'union', types: parts.map(p => {
        const t = p.trim();
        if (t.startsWith('"') || t.startsWith("'")) return { kind: 'literal', value: t.replace(/["']/g, '') };
        return parseType(t, depth + 1);
      })};
    }
  }

  // Handle generic types: Array<string>, Map<string, number>, Promise<T>
  const genericMatch = s.match(/^(\w+)\s*<(.+)>$/);
  if (genericMatch) {
    const baseName = genericMatch[1];
    const typeArgsRaw = genericMatch[2];
    const typeArgs = splitTopLevel(typeArgsRaw, ',').map(a => parseType(a.trim(), depth + 1));
    return { kind: 'generic', name: baseName, typeArgs };
  }

  // Handle primitive types
  if (['string','number','boolean','void','null','undefined'].includes(s))
    return { kind: 'primitive', name: s };

  // Handle literal string types: "value"
  if (s.startsWith('"') || s.startsWith("'"))
    return { kind: 'literal', value: s.replace(/["']/g, '') };

  // Handle object types: {field: type, ...}
  if (s.startsWith('{') && s.endsWith('}')) {
    const fields = [];
    for (const fp of smartSplit(s.slice(1,-1)).filter(Boolean)) {
      // Match: fieldName?: fieldType
      const fm = fp.match(/^(\w+)(\?)?\s*:\s*(.+)$/);
      if (fm) fields.push({
        name: fm[1],
        type: parseType(fm[3], depth + 1),
        optional: fm[2]==='?'  // Optional field marker
      });
    }
    return { kind: 'object', fields };
  }

  // Default: treat as custom type name (imported class, interface, etc.)
  return { kind: 'primitive', name: s };
}

// ============================================================
// PHASE 2: Meta Block Parser
// ============================================================

/**
 * Parse the <meta> block to extract component metadata.
 *
 * Supported properties:
 * - name: Custom element tag name (e.g., 'my-component')
 * - shadow: Shadow DOM mode ('open', 'closed', 'none')
 * - form: Whether component is a form-associated custom element (true/false)
 * - extends: Base class to extend (not yet implemented)
 *
 * Ignores empty lines and lines starting with //
 * Strips inline comments from values
 *
 * @param {string} content - Content of <meta> block
 * @returns {Object} Metadata object {name, shadow, form, extends}
 * @description
 * メタブロックの形式:
 * name: my-component
 * shadow: open
 * form: false
 */
function parseMeta(content) {
  const meta = {};
  for (const line of content.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('//'))) {
    const m = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!m) continue;
    // Strip inline comments and surrounding quotes from value
    let val = m[2].trim().replace(/\s*\/\/.*$/, '').trim().replace(/^["']|["']$/g, '');
    switch(m[1]) {
      case 'name': meta.name = val; break;
      case 'shadow': meta.shadow = val; break;
      case 'form': meta.form = val==='true'; break;
      case 'extends': meta.extends = val; break;
      case 'helpers': {
        // Parse helpers: ["window.__t as tr", "window.__i18n.format as fmt"]
        // Each entry maps a global expression to a local method name
        // Security: source は識別子パス (a.b.c) のみ許可（コードインジェクション防止）
        const helperSourcePattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;
        const raw = val.replace(/^\[|\]$/g, '');
        if (!meta._helperErrors) meta._helperErrors = [];
        meta.helpers = raw.split(',').map(h => {
          const ht = h.trim().replace(/^["']|["']$/g, '');
          const am = ht.match(/^(.+?)\s+as\s+(\w+)$/);
          if (am) {
            const src = am[1].trim();
            if (!helperSourcePattern.test(src)) {
              meta._helperErrors.push(`Invalid helper source: "${src}" — must be a valid identifier path (e.g., "i18n.tr")`);
              return null;
            }
            return { source: src, name: am[2] };
          }
          // No alias: use the last segment as name
          if (!helperSourcePattern.test(ht)) {
            meta._helperErrors.push(`Invalid helper source: "${ht}" — must be a valid identifier path`);
            return null;
          }
          const lastDot = ht.lastIndexOf('.');
          return { source: ht, name: lastDot >= 0 ? ht.substring(lastDot + 1) : ht };
        }).filter(h => h && h.source && h.name);
        break;
      }
      case 'generic': {
        // Parse generic type parameters: T, U extends string, V = number
        meta.generics = val.split(',').map(g => {
          const gt = g.trim();
          // T extends Constraint = Default
          const gm = gt.match(/^(\w+)(?:\s+extends\s+(.+?))?(?:\s*=\s*(.+))?$/);
          if (gm) return {
            name: gm[1],
            constraint: gm[2] ? parseType(gm[2].trim()) : null,
            default: gm[3] ? parseType(gm[3].trim()) : null,
          };
          return { name: gt, constraint: null, default: null };
        });
        break;
      }
    }
  }
  return meta;
}

/**
 * Count brace balance on a single line, ignoring string literals and comments.
 *
 * Used to track multi-line function and block parsing in parseScript().
 * Returns (opening braces) - (closing braces) to determine if a block is complete.
 *
 * Example:
 * countBraces("fn myFunc() {") returns 1 (incomplete block)
 * countBraces("  return x + y;") returns 0 (inside block)
 * countBraces("}") returns -1 (closing the block)
 *
 * @param {string} line - Single line of code
 * @returns {number} Net brace balance (positive = unmatched opens, negative = unmatched closes)
 * @description
 * この関数は、文字列やコメント内の括弧を無視して、
 * 実際のコードの括弧数のバランスを計算します。
 */
function countBraces(line) {
  // Strip all string literals and comments to avoid counting braces inside them
  let stripped = line
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')    // Strip double-quoted strings (handle escapes)
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')    // Strip single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ')    // Strip template literal backticks
    .replace(/\/\/.*$/g, ' ');              // Strip inline comments
  const opens = (stripped.match(/\{/g) || []).length;
  const closes = (stripped.match(/\}/g) || []).length;
  return opens - closes;
}

// ============================================================
// PHASE 2: Script Block Parser
// ============================================================

/**
 * Parse the <script> block to extract all declarations.
 *
 * Recognizes these declaration types:
 * - import: Module imports (default, named, namespace)
 * - type: Type aliases (e.g., type Status = 'active' | 'inactive')
 * - state: Reactive state variables (e.g., state count: number = 0)
 * - prop: Component properties (e.g., prop title: string = "Default")
 * - computed: Derived state (e.g., computed doubled: number = count * 2)
 * - emit: Event declarations (e.g., emit onChange: string)
 * - ref: DOM element references (e.g., ref inputEl: HTMLInputElement)
 * - fn: Methods (e.g., fn increment() { ... })
 * - watch: Reactive watchers (e.g., watch(count) { ... })
 * - provide: Context provider values (e.g., provide user: User = currentUser)
 * - consume: Context consumer declarations (e.g., consume user: User)
 * - on mount|unmount|adopt: Lifecycle hooks
 *
 * Multi-line declarations are automatically collected using countBraces().
 *
 * @param {string} content - Content of <script> block
 * @param {number} startLine - Starting line number (for diagnostics)
 * @returns {Array<Object>} Array of declaration objects
 * @description
 * この関数は、スクリプトブロックをラインバイラインでパースします。
 * 複数行にわたる関数やwatchブロックは、括弧のバランスで終了を判定します。
 */
function parseScript(content, startLine) {
  // Normalize CRLF (Windows) and CR (old Mac) to LF (Unix)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const decls = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const ln = startLine + i;
    // Skip empty lines and comments
    if (!line || line.startsWith('//')) { i++; continue; }

    let m;

    // ─── Import declarations ───
    // Support: import "mod" (side-effect import)
    // Support: import * as ns from "mod"
    // Support: import Default from "mod"
    // Support: import { Named1, Named2 } from "mod"
    // Support: import { Name as Alias } from "mod"
    // Support: import Default, { Named1, Named2 } from "mod"
    // Support: import type { Type } from "mod" (type-only, stripped from JS output)
    if ((m = line.match(/^import\s+type\s+(?:(\w+)\s+from\s+|{([^}]+)}\s+from\s+)["']([^"']+)["']/))) {
      // Type-only import: stripped from JS, kept for TS target
      decls.push({
        kind:'import',
        typeOnly: true,
        defaultImport: m[1],
        namedImports: m[2]?.split(',').map(s=>s.trim()),
        from: m[3],
        span: {line: ln}
      });
      i++; continue;
    }
    if ((m = line.match(/^import\s+["']([^"']+)["']\s*$/))) {
      // Side-effect import: import "module"
      decls.push({
        kind:'import',
        defaultImport: undefined,
        namedImports: undefined,
        from: m[1],
        span: {line: ln}
      });
      i++; continue;
    }
    if ((m = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/))) {
      decls.push({
        kind:'import',
        defaultImport: undefined,
        namedImports: [`*:${m[1]}`],  // Namespace import stored as *:name
        from: m[2],
        span: {line: ln}
      });
      i++; continue;
    }
    if ((m = line.match(/^import\s+(\w+)\s*,\s*{\s*([^}]+)\s*}\s+from\s+["']([^"']+)["']/))) {
      // Default import with named imports
      const named = m[2].split(',').map(s=>s.trim());
      decls.push({
        kind:'import',
        defaultImport: m[1],
        namedImports: named,
        from: m[3],
        span: {line: ln}
      });
      i++; continue;
    }
    if ((m = line.match(/^import\s+(?:(\w+)\s+from\s+|{([^}]+)}\s+from\s+)["']([^"']+)["']/))) {
      // Default-only or named-only imports
      decls.push({
        kind:'import',
        defaultImport: m[1],
        namedImports: m[2]?.split(',').map(s=>s.trim()),
        from: m[3],
        span: {line: ln}
      });
      i++; continue;
    }

    // SEC-06: Warn about unrecognized import statements (e.g., multi-line imports)
    if (line.match(/^import\s/)) {
      decls.push({
        kind: '_diagnostic',
        level: 'warning',
        code: 'W0302',
        message: `Unrecognized import format at line ${ln}: "${line.length > 60 ? line.substring(0, 57) + '...' : line}". Use single-line import syntax`,
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Type aliases ───
    if ((m = line.match(/^type\s+(\w+)\s*=\s*(.+)$/))) {
      decls.push({
        kind:'type',
        name: m[1],
        type: parseType(m[2]),
        span: {line: ln}
      });
      i++; continue;
    }
    // ─── State declarations ───
    // Format: state varName: type = initialValue
    if ((m = line.match(/^state\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/))) {
      decls.push({
        kind:'state',
        name: m[1],
        type: parseType(m[2].trim()),
        init: m[3].trim(),  // Initial value expression
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Prop declarations ───
    // Format: prop varName: type [= defaultValue]
    // Default value is optional for props (fall back to type-specific defaults)
    if ((m = line.match(/^prop\s+(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/))) {
      decls.push({
        kind:'prop',
        name: m[1],
        type: parseType(m[2].trim()),
        default: m[3]?.trim(),  // Optional default value
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Computed declarations ───
    // Format: computed varName: type = expression
    // Computed values are derived (read-only)
    // Supports multi-line expressions (e.g., arrow functions with block bodies)
    if ((m = line.match(/^computed\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/))) {
      let expr = m[3].trim();
      // Check if expression has unclosed braces (multi-line)
      let braceDepth = 0;
      for (const ch of expr) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      // Continue reading lines until braces are balanced
      while (braceDepth > 0 && i + 1 < lines.length) {
        i++;
        const nextLine = lines[i];
        expr += '\n' + nextLine;
        for (const ch of nextLine) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
      }
      decls.push({
        kind:'computed',
        name: m[1],
        type: parseType(m[2].trim()),
        expr: expr,
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Emit declarations ───
    // Format: emit [options] eventName: detailType
    // Options: (local) (bubbles) (composed) - no options = bubbles + composed
    if ((m = line.match(/^emit(?:\(([^)]*)\))?\s+(\w+)\s*:\s*(.+)$/))) {
      const rawOpts = m[1] || '';
      const opts = rawOpts ? rawOpts.split(',').map(s => s.trim().toLowerCase()) : [];
      const emitOpts = {};
      if (opts.includes('local')) {
        // 'local' is shorthand for non-bubbling, non-composed
        emitOpts.bubbles = false;
        emitOpts.composed = false;
      } else {
        // Default: bubbles and composed unless explicitly disabled
        emitOpts.bubbles = opts.length === 0 || opts.includes('bubbles');
        emitOpts.composed = opts.length === 0 || opts.includes('composed');
      }
      decls.push({
        kind:'emit',
        name: m[2],
        type: parseType(m[3].trim()),
        options: emitOpts,
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Ref declarations ───
    // Format: ref varName: ElementType
    // Used to hold references to DOM elements
    if ((m = line.match(/^ref\s+(\w+)\s*:\s*(.+)$/))) {
      decls.push({
        kind:'ref',
        name: m[1],
        type: parseType(m[2].trim()),
        span: {line: ln}
      });
      i++; continue;
    }
    // ─── Function declarations ───
    // Format: [async] fn funcName(param1: type1, param2: type2): returnType { ... }
    if ((m = line.match(/^fn\s+(async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?\s*\{/))) {
      const params = [];
      if (m[3].trim()) {
        for (const p of m[3].split(',')) {
          const pm = p.trim().match(/^(\w+)\s*:\s*(.+)$/);
          if (pm) params.push({ name:pm[1], type:parseType(pm[2]) });
        }
      }
      // Check if function body is on the same line (single-line fn)
      const afterBrace = line.substring(m[0].length);
      const sameLineBraces = countBraces(afterBrace);
      if (sameLineBraces <= -1) {
        // Body closes on same line: fn name() { ... }
        // Extract body between { and last }
        const bodyMatch = afterBrace.match(/^([\s\S]*)\}\s*$/);
        const body = bodyMatch ? bodyMatch[1].trim() : afterBrace.trim();
        decls.push({
          kind:'fn',
          name: m[2],
          async: !!m[1],
          params: params,
          returnType: m[4] ? parseType(m[4]) : undefined,
          body: body,
          span: {line: ln}
        });
        i++; continue;
      }
      // Multi-line function body: collect lines until braces balance
      let body = afterBrace.trim() ? afterBrace.trim() + '\n' : '';
      let bc = 1 + sameLineBraces;  // Account for any braces on the opening line after {
      i++;
      while (i<lines.length && bc>0) {
        const l=lines[i];
        bc+=countBraces(l);
        if (bc>0) body+=(body?'\n':'')+l;
        i++;
      }
      decls.push({
        kind:'fn',
        name: m[2],
        async: !!m[1],  // True if 'async' keyword present
        params: params,
        returnType: m[4] ? parseType(m[4]) : undefined,
        body: body.trim(),
        span: {line: ln}
      });
      continue;
    }

    // ─── Lifecycle hooks ───
    // Format: on mount|unmount|adopt { ... }
    if ((m = line.match(/^on\s+(mount|unmount|adopt|error|formAssociated|formDisabled|formReset|formStateRestore)\s*\{/))) {
      // Multi-line block: collect until braces balance
      let body='', bc=1;
      i++;
      while (i<lines.length && bc>0) {
        const l=lines[i];
        bc+=countBraces(l);
        if (bc>0) body+=(body?'\n':'')+l;
        i++;
      }
      decls.push({
        kind:'lifecycle',
        event: m[1],  // 'mount', 'unmount', or 'adopt'
        body: body.trim(),
        span: {line: ln}
      });
      continue;
    }

    // ─── Watch declarations ───
    // Format: watch(dep1, dep2, dep3) { ... }  or  watch dep { ... }
    // Triggered when any of the dependencies change
    if ((m = line.match(/^watch\s*\(([^)]+)\)\s*\{/)) || (m = line.match(/^watch\s+(\w+(?:\s*,\s*\w+)*)\s*\{/))) {
      const deps = m[1].split(',').map(d=>d.trim());
      // Multi-line block: collect until braces balance
      let body='', bc=1;
      i++;
      while (i<lines.length && bc>0) {
        const l=lines[i];
        bc+=countBraces(l);
        if (bc>0) body+=(body?'\n':'')+l;
        i++;
      }
      decls.push({
        kind:'watch',
        deps: deps,
        body: body.trim(),
        span: {line: ln}
      });
      continue;
    }

    // ─── Const declarations (non-reactive private constants) ───
    // Format: const varName: type = initialValue
    // Format: const varName = initialValue (type inferred)
    if ((m = line.match(/^const\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(.+)$/))) {
      decls.push({
        kind:'const',
        name: m[1],
        type: m[2] ? parseType(m[2].trim()) : { kind: 'primitive', name: 'any' },
        init: m[3].trim(),
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Let declarations (non-reactive private variables) ───
    // Format: let varName: type = initialValue
    // Format: let varName = initialValue (type inferred)
    if ((m = line.match(/^let\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(.+)$/))) {
      decls.push({
        kind:'let',
        name: m[1],
        type: m[2] ? parseType(m[2].trim()) : { kind: 'primitive', name: 'any' },
        init: m[3].trim(),
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Provide declarations ───
    // Format: provide varName: type = initialValue
    // Used for context/dependency injection
    if ((m = line.match(/^provide\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/))) {
      decls.push({
        kind:'provide',
        name: m[1],
        type: parseType(m[2].trim()),
        init: m[3].trim(),
        span: {line: ln}
      });
      i++; continue;
    }

    // ─── Consume declarations ───
    // Format: consume varName: type [from tag-name]
    // Used to subscribe to provided context
    // "from" clause is optional — restricts to a specific provider tag
    if ((m = line.match(/^consume\s+(\w+)\s*:\s*([^f][^\s]*(?:\s*\|\s*\S+)*)\s+from\s+(\S+)$/)) ||
        (m = line.match(/^consume\s+(\w+)\s*:\s*(.+)$/))) {
      decls.push({
        kind:'consume',
        name: m[1],
        type: parseType(m[2].trim()),
        from: m[3] || null,
        span: {line: ln}
      });
      i++; continue;
    }
    i++;
  }
  return decls;
}

// ============================================================
// PHASE 2: Template Block Parser
// ============================================================

/**
 * Recursively parse HTML template nodes.
 *
 * Recognizes and parses:
 * - Text nodes (raw HTML text)
 * - Interpolation {{ expression }}
 * - Element nodes <tag attr="value">...</tag>
 * - If blocks <#if condition="expr"> ... <:else-if> ... <:else> ... </#if>
 * - For loops <#for each="item" of="array" key="id"> ... <:empty> ... </#for>
 *
 * This is the main entry point for template parsing.
 *
 * @param {string} html - HTML template string
 * @param {Array} [errors] - Diagnostics array (optional, populated with warnings)
 * @returns {Array<Object>} AST nodes (text, interpolation, element, if, for)
 * @description
 * テンプレートを再帰的にパースします。
 * 左から右へスキャンし、各ノードタイプを認識します。
 */
function parseTemplateNodes(html, errors) {
  const errs = errors || [];
  const nodes = [];
  let pos = 0;

  while (pos < html.length) {
    // ─── Raw interpolation {{{ expr }}} — bypasses #esc() ───
    if (html.startsWith('{{{', pos)) {
      const end = html.indexOf('}}}', pos+3);
      if (end !== -1) {
        const expr = html.substring(pos+3, end).trim();
        if (expr !== '') {
          nodes.push({ kind:'rawInterpolation', expr: expr });
          pos = end + 3;
          continue;
        }
        // Empty {{{ }}} → treat as literal text
        nodes.push({ kind:'text', value: '{{{ }}}' });
        pos = end + 3;
        continue;
      }
      // Unclosed {{{ → treat as text
      nodes.push({ kind:'text', value: '{{{' });
      pos += 3;
      continue;
    }

    // ─── Escaped literal \{{ → outputs {{ as text ───
    if (html.startsWith('\\{{', pos)) {
      // Find matching \}} or }} to consume the whole escaped block
      const end2 = html.indexOf('\\}}', pos+3);
      const end1 = html.indexOf('}}', pos+3);
      if (end2 !== -1 && (end1 === -1 || end2 <= end1)) {
        // \{{ ... \}} → literal {{ ... }}
        nodes.push({ kind:'text', value: '{{' + html.substring(pos+3, end2) + '}}' });
        pos = end2 + 3;
      } else if (end1 !== -1) {
        // \{{ ... }} → literal {{ ... }}
        nodes.push({ kind:'text', value: '{{' + html.substring(pos+3, end1) + '}}' });
        pos = end1 + 2;
      } else {
        // No closing found, just output \{{ as literal {{
        nodes.push({ kind:'text', value: '{{' });
        pos += 3;
      }
      continue;
    }

    // ─── Interpolation nodes {{ expr }} ───
    if (html.startsWith('{{', pos)) {
      const end = html.indexOf('}}', pos+2);
      if (end!==-1) {
        // Empty expression {{ }} → literal text (not interpolation)
        const expr = html.substring(pos+2, end).trim();
        if (expr === '') {
          nodes.push({ kind:'text', value: '{{ }}' });
          pos = end + 2;
          continue;
        }
        nodes.push({
          kind:'interpolation',
          expr: expr
        });
        pos = end + 2;
        continue;
      } else {
        // Unclosed {{ - emit warning and treat as text
        errs.push({
          level: 'warning',
          code: 'W0301',
          message: 'Unclosed {{ in template'
        });
        nodes.push({ kind:'text', value:'{{' });
        pos += 2;
        continue;
      }
    }

    // ─── Control flow blocks ───
    if (html.startsWith('<#if', pos)) {
      const r = parseIfBlock(html, pos);
      nodes.push(r.node);
      pos = r.end;
      continue;
    }
    if (html.startsWith('<#for', pos)) {
      const r = parseForBlock(html, pos);
      nodes.push(r.node);
      pos = r.end;
      continue;
    }

    // ─── Element nodes ───
    // Check for opening tag (but not closing tag </tag> or special tags <: and <#)
    if (html[pos]==='<' && html[pos+1]!=='/' && !html.startsWith('<:',pos) && !html.startsWith('<#',pos)) {
      const r = parseElement(html, pos);
      if(r) {
        nodes.push(r.node);
        pos = r.end;
        continue;
      }
    }

    // ─── Text nodes ───
    const next = findNext(html, pos);
    const text = html.substring(pos, next);
    if (text.trim()) nodes.push({ kind:'text', value:text });
    pos = next;
  }
  return nodes;
}
/**
 * Find the position of the next template syntax element.
 *
 * Scans for the nearest occurrence of: {{, <#if, <#for, or <
 * Used to identify text content before the next element.
 *
 * @param {string} html - Template HTML
 * @param {number} pos - Current scan position
 * @returns {number} Position of next syntax element, or html.length if none found
 */
function findNext(html,pos){
  let min=html.length;
  // {{{ (raw interpolation), \{{ (escaped), {{ を先に検出するため順序が重要
  for(const m of['{{{','\\{{','{{','<#if','<#for','<']){
    const i=html.indexOf(m,pos+1);
    if(i!==-1&&i<min)min=i;
  }
  return min;
}

/**
 * Parse an HTML element node (opening tag, attributes, children, closing tag).
 *
 * Handles:
 * - Self-closing elements: <tag ... />
 * - Normal elements: <tag ...> children </tag>
 * - Custom elements (must use closing tag, not self-closing)
 * - Missing close tags (emitted as diagnostic warning)
 * - Nested elements with proper depth tracking
 *
 * @param {string} html - Full template HTML
 * @param {number} pos - Position of opening < character
 * @returns {Object|null} {node, end} or null if not a valid element
 * @description
 * 要素のネストを正しく追跡します。
 * タグ名の完全一致を確認して、<button> を <but で誤認識しません。
 */
function parseElement(html,pos){
  // Match opening tag: <tag attr="value" />
  const m=html.substring(pos).match(/^<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)(\s*\/?)>/);
  if(!m)return null;

  const tag=m[1],          // Tag name
        attrsStr=m[2],      // Attributes string
        self=m[3].includes('/'),  // Self-closing?
        tagEnd=pos+m[0].length;

  const attrs=parseAttrs(attrsStr);

  // Self-closing elements
  if(self) {
    return {
      node: {kind:'element', tag, attrs, children:[], selfClosing:true},
      end: tagEnd
    };
  }

  // Regular elements: find matching closing tag with proper nesting
  const close=`</${tag}>`;
  let depth=1, sp=tagEnd;
  while(depth>0 && sp<html.length) {
    const no=html.indexOf(`<${tag}`, sp),     // Next opening tag
          nc=html.indexOf(close, sp);          // Next closing tag
    if(nc===-1) break;

    if(no!==-1 && no<nc) {
      // Nested opening tag found - but verify it's not a partial match
      // e.g., <button must not match <but from <button>
      const nextCharIdx=no+tag.length+1;
      if(nextCharIdx<html.length) {
        const nextChar=html[nextCharIdx];
        // Valid tag boundaries: whitespace, >, or /
        if(/[\s>/]/.test(nextChar)) {
          // Valid nested opening tag
          const a=html.indexOf('>', no);
          if(a!==-1 && html[a-1]!=='/') depth++;
          sp=a+1;
        } else {
          // Partial match, skip
          sp=no+tag.length+1;
        }
      } else {
        sp=no+tag.length+1;
      }
    } else {
      // Closing tag is next
      depth--;
      if(depth===0) {
        const innerHtml = html.substring(tagEnd, nc);
        // <script> 内では {{ }} を補間として解釈しない
        // <pre>, <code>, <textarea> は補間を正常にサポートし、
        // リテラルな {{ }} が必要な場合は \{{ エスケープ構文を使用する
        const rawTags = ['script'];
        const children = rawTags.includes(tag.toLowerCase())
          ? (innerHtml.trim() ? [{ kind: 'text', value: innerHtml }] : [])
          : parseTemplateNodes(innerHtml);
        return {
          node: {
            kind:'element',
            tag,
            attrs,
            children,
            selfClosing: false
          },
          end: nc+close.length
        };
      }
      sp=nc+close.length;
    }
  }

  // Missing closing tag - emit diagnostic and treat as self-closing
  return {
    node: {
      kind:'element',
      tag,
      attrs,
      children: [],
      selfClosing: true,
      _missingCloseTag: true  // Flag for diagnostic reporting
    },
    end: tagEnd
  };
}

/**
 * Parse element attributes and directives.
 *
 * Recognizes:
 * - Regular attributes: name="value"
 * - Dynamic bindings: :name="expr"
 * - Event handlers: @eventName="expr"
 * - Two-way binding: :bind or :bind.modifier
 * - Raw HTML: @html="expr"
 * - Element reference: ref
 * - Spread: :...name (bind all props from object)
 * - Modifiers: |prevent|stop|enter|esc (attached to events)
 *
 * @param {string} str - Attributes string (between tag name and >)
 * @returns {Array<Object>} Parsed attributes with metadata
 */
function parseAttrs(str){
  const attrs=[];
  // Fixed regex to prevent ReDoS: limit pipe modifiers to max 10 to prevent catastrophic backtracking
  // Original regex: /([:\@]?[\w\-\.]+(?:\|[\w]+)*)(?:\s*=\s*"([^"]*)")?/g
  // Issue: nested quantifiers with (?: ... )* could cause exponential backtracking
  // Fix: use {0,10} to limit modifier count instead of *
  const re=/([:\@]?[\w\-\.]+(?:\|[\w]+){0,10})(?:\s*=\s*"([^"]*)")?/g;
  let m;
  while((m=re.exec(str))!==null){
    let name=m[1],
        value=m[2]||'',
        dynamic=false,  // :name directive
        event=false,    // @name directive
        bind=false,     // :bind directive
        ref=false,      // ref attribute
        html=false,     // @html directive
        spread=false;   // :...name directive

    // Parse modifiers (attached with |) from name
    const parts=name.split('|');
    // Safety check: limit modifier count to prevent DoS attacks
    if(parts.length>11) {
      // Truncate to max 10 modifiers (1 name + 10 modifiers = 11 parts)
      parts.length=11;
    }
    const modifiers=parts.slice(1);
    name=parts[0];

    // Directive detection
    // 有効な DOM イベント名のホワイトリスト（@media 等の CSS at-rule や任意属性を誤認しない）
    const validEvents = new Set([
      'click','dblclick','mousedown','mouseup','mousemove','mouseover','mouseout','mouseenter','mouseleave',
      'keydown','keyup','keypress','input','change','submit','reset','focus','blur','focusin','focusout',
      'scroll','resize','wheel','contextmenu','drag','dragstart','dragend','dragover','dragenter','dragleave','drop',
      'touchstart','touchend','touchmove','touchcancel','pointerdown','pointerup','pointermove','pointerover',
      'pointerout','pointerenter','pointerleave','pointercancel','gotpointercapture','lostpointercapture',
      'animationstart','animationend','animationiteration','transitionend','transitionstart','transitionrun','transitioncancel',
      'load','error','abort','beforeunload','unload','hashchange','popstate',
      'select','copy','cut','paste','compositionstart','compositionupdate','compositionend',
      'fullscreenchange','fullscreenerror','visibilitychange',
      'toggle','close','cancel','invalid','formdata','slotchange',
    ]);
    if(name===':bind') {bind=true; name='bind';}
    else if(name.startsWith(':...')) {spread=true; name=name.slice(4);}
    else if(name.startsWith(':')) {dynamic=true; name=name.slice(1);}
    else if(name==='@html') {html=true; name='html';}
    else if(name.startsWith('@')) {
      const evName = name.slice(1).split('|')[0]; // modifiers 除去
      if(validEvents.has(evName)) {
        event=true; name=name.slice(1);
      }
      // else: @media, @sample 等は通常の属性として扱う（event=false のまま）
    }
    else if(name==='ref'){ref=true;}
    attrs.push({name,value,dynamic,event,bind,ref,modifiers,html,spread});
  }
  return attrs;
}
/**
 * Find matching closing tag for a block tag (e.g., <#if ... </#if>).
 *
 * Tracks nesting depth to handle nested blocks.
 * Returns html.length if no matching close found (error case).
 *
 * @param {string} html - Full HTML
 * @param {number} start - Position after opening tag
 * @param {string} bt - Block tag name (e.g., '#if' or '#for')
 * @returns {number} Position of matching closing tag's <, or html.length
 */
function findMatchingClose(html,start,bt){
  let d=1, p=start;
  const o=`<${bt}`,     // Opening tag pattern
        c=`</${bt}>`;    // Closing tag pattern
  while(d>0 && p<html.length) {
    const no=html.indexOf(o,p),
          nc=html.indexOf(c,p);
    if(nc===-1) return html.length;
    if(no!==-1 && no<nc) {
      d++;
      p=no+o.length;
    } else {
      d--;
      if(d===0) return nc;
      p=nc+c.length;
    }
  }
  return html.length;
}

/**
 * Parse a conditional block <#if condition="expr"> ... <:else-if> ... <:else> ... </#if>.
 *
 * Supports:
 * - Main condition: <#if condition="expr">
 * - Else-if chain: <:else-if condition="expr"> (multiple)
 * - Final else: <:else>
 *
 * @param {string} html - Full template HTML
 * @param {number} pos - Position of <#if
 * @returns {{node: Object, end: number}} Parsed if node and position after closing tag
 * @description
 * 条件付きブロックを再帰的に解析します。
 * :else-if と :else をサポートしています。
 */
function parseIfBlock(html,pos){
  const om=html.substring(pos).match(/<#if\s+condition="([^"]+)">/);
  if(!om){
    // Return error node instead of throwing
    return { node: { kind:'text', value: 'Error: Invalid #if syntax' }, end: pos+1 };
  }
  const cond=om[1],sp=pos+om[0].length,cp=findMatchingClose(html,sp,'#if');
  let inner=html.substring(sp,cp),elseChildren,elseIfChain=[];

  // Parse :else-if and :else branches
  let remaining = inner;
  const mainEndRe = /<:else-if\s+condition="([^"]+)">|<:else>/;
  const mainMatch = remaining.match(mainEndRe);
  if (mainMatch && mainMatch.index !== undefined) {
    const mainContent = remaining.substring(0, mainMatch.index);
    remaining = remaining.substring(mainMatch.index);

    // Parse chain of :else-if and final :else
    while (remaining.length > 0) {
      const eifm = remaining.match(/^<:else-if\s+condition="([^"]+)">/);
      if (eifm) {
        remaining = remaining.substring(eifm[0].length);
        const nextBranch = remaining.match(/<:else-if\s+condition="([^"]+)">|<:else>/);
        let branchContent;
        if (nextBranch && nextBranch.index !== undefined) {
          branchContent = remaining.substring(0, nextBranch.index);
          remaining = remaining.substring(nextBranch.index);
        } else {
          branchContent = remaining;
          remaining = '';
        }
        elseIfChain.push({ condition: eifm[1], children: parseTemplateNodes(branchContent.trim()) });
        continue;
      }
      const elsem = remaining.match(/^<:else>/);
      if (elsem) {
        elseChildren = parseTemplateNodes(remaining.substring(elsem[0].length).trim());
        break;
      }
      break;
    }
    inner = mainContent;
  }

  const node = { kind:'if', condition:cond, children:parseTemplateNodes(inner.trim()), elseIfChain: elseIfChain.length > 0 ? elseIfChain : undefined, elseChildren };
  return{node, end:cp+'</#if>'.length};
}
/**
 * Parse a for-loop block <#for each="item" of="array" key="id"> ... <:empty> ... </#for>.
 *
 * Supports:
 * - each: Loop variable name(s) - can be "item" or "item, index" for two-variable iteration
 * - of: Array/iterable expression to loop over
 * - key: Unique key expression for each item (used for efficient DOM updates)
 * - <:empty>: Optional placeholder content when array is empty
 *
 * Attributes can be in any order.
 *
 * @param {string} html - Full template HTML
 * @param {number} pos - Position of <#for
 * @returns {{node: Object, end: number}} Parsed for node and position after closing tag
 * @description
 * ループ宣言: <#for each="item, index" of="items" key="item.id">
 * - each に "item" を指定: item のみ
 * - each に "item, index" を指定: item と index の両方を利用可能
 */
function parseForBlock(html,pos){
  // Match opening tag with flexible attribute order
  const tagMatch=html.substring(pos).match(/<#for\s+((?:[^>])+)>/);
  if(!tagMatch){
    return { node: { kind:'text', value: 'Error: Invalid #for syntax' }, end: pos+1 };
  }

  const attrStr=tagMatch[1];
  // Extract each, of, key attributes (in any order)
  const eachM=attrStr.match(/each="([^"]+)"/);
  const ofM=attrStr.match(/of="([^"]+)"/);
  const keyM=attrStr.match(/key="([^"]+)"/);

  if(!eachM||!ofM) {
    return {
      node: { kind:'text', value: 'Error: Invalid #for: missing required attributes (each, of)' },
      end: pos+1
    };
  }

  // Parse 'each' attribute: supports "item" or "item, index"
  const ep=eachM[1].split(',').map(s=>s.trim()),
        each=ep[0],      // Loop variable
        index=ep[1],     // Optional index variable
        of_=ofM[1],      // Array expression
        key=keyM?keyM[1]:null;  // Key expression (optional, defaults to index)

  const om=tagMatch;
  const sp=pos+om[0].length,
        cp=findMatchingClose(html,sp,'#for');
  let inner=html.substring(sp,cp),
      emptyChildren;

  // Extract optional <:empty> block (content when array is empty)
  const emm=inner.match(/<:empty>([\s\S]*?)<\/:empty>/);
  if(emm&&emm.index!==undefined) {
    emptyChildren=parseTemplateNodes(emm[1]);
    // Remove <:empty> block from inner content
    inner=inner.substring(0,emm.index)+inner.substring(emm.index+emm[0].length);
  }

  return {
    node: {
      kind:'for',
      each: each,       // Loop variable name
      index: index,     // Optional index variable
      of: of_,          // Array expression
      key: key,         // Key expression for efficient updates
      children: parseTemplateNodes(inner),
      emptyChildren: emptyChildren
    },
    end: cp+'</#for>'.length
  };
}

// ============================================================
// PHASE 3: Type Checker
// ============================================================

/**
 * Type checking and validation of the entire component.
 *
 * Responsibilities:
 * 1. Build symbol table from script declarations
 * 2. Check script: validate state/prop initial values, detect computed order issues, warn about watch nesting
 * 3. Check template: validate variable references, check for undefined identifiers, detect XSS/injection risks
 * 4. Detect unused state variables
 * 5. Report security warnings (@html, dynamic href/src)
 *
 * Generates diagnostics (errors and warnings) for the user.
 *
 * @description
 * 型チェッカーは以下を実行します:
 * - シンボル テーブルの構築 (state, prop, computed, fn, emit, ref, provide, consume, import)
 * - 型互換性チェック (初期値, デフォルト値)
 * - テンプレート変数の参照チェック (未定義の識別子を検出)
 * - セキュリティ警告 (@html, 動的な href/src, 静的な id 属性)
 */
class TypeChecker {
  constructor(component){
    this.c=component;              // Component AST
    this.symbols=new Map();        // Symbol table: name -> {type, source}
    this.diags=[];                 // Diagnostics (errors and warnings)
    this.typeAliases=new Map();    // Type alias lookup table
  }

  /**
   * Run all type checks and return diagnostics.
   */
  check(){
    this.buildSymbols();
    this.checkScript();
    this.checkTemplate(this.c.template);
    this.checkUnused();
    return this.diags;
  }

  /**
   * Build symbol table from all script declarations.
   *
   * Registers all identifiers (state, prop, computed, fn, emit, ref, etc.)
   * so they can be referenced in template expressions.
   */
  buildSymbols(){
    // Register generic type parameters from meta block
    if(this.c.meta.generics){
      for(const g of this.c.meta.generics){
        this.typeAliases.set(g.name, g.constraint || { kind: 'primitive', name: 'any' });
      }
    }
    for(const d of this.c.script){
      switch(d.kind){
        case'import':
      // P1-14: Add imported symbols to symbol table
      if(d.defaultImport)this.symbols.set(d.defaultImport,{type:{kind:'primitive',name:'any'},source:'import'});
      if(d.namedImports)for(const ni of d.namedImports){const name=ni.includes(':')?ni.split(':')[1]:ni;this.symbols.set(name,{type:{kind:'primitive',name:'any'},source:'import'});}
      break;
      case'state':this.symbols.set(d.name,{type:d.type,source:'state'});break;case'prop':this.symbols.set(d.name,{type:d.type,source:'prop'});break;case'computed':this.symbols.set(d.name,{type:d.type,source:'computed'});break;case'fn':this.symbols.set(d.name,{type:d.returnType||{kind:'primitive',name:'void'},source:'fn'});break;case'emit':this.symbols.set(d.name,{type:d.type,source:'emit'});break;case'ref':this.symbols.set(d.name,{type:d.type,source:'ref'});break;case'provide':this.symbols.set(d.name,{type:d.type,source:'provide'});break;case'consume':this.symbols.set(d.name,{type:d.type,source:'consume'});break;case'const':this.symbols.set(d.name,{type:d.type,source:'const'});break;case'let':this.symbols.set(d.name,{type:d.type,source:'let'});break;case'type':this.typeAliases.set(d.name,d.type);break;}}
    // Register helpers from <meta> block as function symbols
    if(this.c.meta.helpers){for(const h of this.c.meta.helpers)this.symbols.set(h.name,{type:{kind:'primitive',name:'any'},source:'fn'});}
  }
  checkScript(){
    for(const d of this.c.script){
      if(d.kind==='state'){const t=this.infer(d.init);if(t&&!this.assignable(t,d.type))this.diags.push({level:'error',code:'E0201',message:msg('E0201',{id:d.name}),span:d.span});}
      // P1-15: Check prop default values against declared type
      if(d.kind==='prop'&&d.default){const t=this.infer(d.default);if(t&&!this.assignable(t,d.type))this.diags.push({level:'error',code:'E0202',message:msg('E0202',{id:d.name}),span:d.span});}
    }
    // P1-16: Detect computed referencing another computed declared after it
    const computedMap=new Map();this.c.script.forEach(d=>{if(d.kind==='computed')computedMap.set(d.name,d);});
    for(const d of this.c.script){
      if(d.kind==='computed'){
        const ids=(d.expr.match(/\b\w+\b/g)||[]);
        for(const id of ids){
          const ref=computedMap.get(id);
          if(ref&&ref.span.line>d.span.line){
            this.diags.push({level:'warning',code:'W0204',message:msg('W0204',{id:d.name,dep:id}),span:d.span});
          }
        }
      }
    }
    // P2-31: Warn about watch deps with nested paths (obj.field) which generate invalid code
    for(const d of this.c.script){
      if(d.kind==='watch'){
        for(const dep of d.deps){
          if(dep.includes('.')){
            this.diags.push({level:'warning',code:'W0301',message:msg('W0301',{dep:dep}),span:d.span});
          }
        }
      }
    }
  }
  checkTemplate(nodes, inLoop = false, ctx = ''){for(const n of nodes){if(n.kind==='interpolation')this.checkInterp(n, ctx);else if(n.kind==='rawInterpolation'){this.checkInterp(n, ctx);this.diags.push({level:'warning',code:'W0210',message:msg('W0210'),context:ctx});}else if(n.kind==='element'){
    // 要素コンテキストパスを構築（エラーメッセージの位置特定に使用）
    const elCtx = ctx ? `${ctx} > <${n.tag}>` : `<${n.tag}>`;
    n.attrs.forEach(a=>{
    if(a.dynamic||a.bind)this.checkVars(a.value, elCtx);
    // S-17: Validate event handler expressions to prevent code injection
    if(a.event){this.validateEventHandlerAttr(a, elCtx);this.checkVars(a.value, elCtx);}
    // Security: warn about @html usage
    if(a.html)this.diags.push({level:'warning',code:'W0201',message:msg('W0201'),context:elCtx});
    // Security: warn about dynamic href/src (potential javascript: URL injection)
    if(a.dynamic&&(a.name==='href'||a.name==='src'))this.diags.push({level:'warning',code:'W0202',message:msg('W0202',{attr:a.name}),context:elCtx});
    // P1-24: Warn about static id attributes ONLY inside <#for> loops (cause duplication on re-render)
    if(a.name==='id'&&!a.dynamic&&inLoop)this.diags.push({level:'warning',code:'W0203',message:msg('W0203'),context:elCtx});
  });this.checkTemplate(n.children, inLoop, elCtx);}else if(n.kind==='if'){this.checkVars(n.condition, ctx);this.checkTemplate(n.children, inLoop, ctx);if(n.elseIfChain)for(const branch of n.elseIfChain){this.checkVars(branch.condition, ctx);this.checkTemplate(branch.children, inLoop, ctx);}if(n.elseChildren)this.checkTemplate(n.elseChildren, inLoop, ctx);}else if(n.kind==='for'){
      const forCtx = ctx ? `${ctx} > <#for each="${n.each}">` : `<#for each="${n.each}">`;
      // P2-33: Add loop vars to symbols BEFORE checking 'of' expression to avoid false positives
      this.symbols.set(n.each,{type:{kind:'primitive',name:'string'},source:'loop'});
      if(n.index)this.symbols.set(n.index,{type:{kind:'primitive',name:'number'},source:'loop'});
      this.checkVars(n.of, forCtx);
      this.checkTemplate(n.children, true, forCtx);if(n.emptyChildren)this.checkTemplate(n.emptyChildren, true, forCtx);
      this.symbols.delete(n.each);if(n.index)this.symbols.delete(n.index);
    }}}
  checkInterp(n, ctx=''){const m=n.expr.match(/^(\w+)\.(\w+)\(/);if(m){const sym=this.symbols.get(m[1]);if(sym&&sym.type.kind==='primitive'){const strM=['toUpperCase','toLowerCase','trim','split','replace','includes','startsWith','endsWith','indexOf','slice'];if(sym.type.name==='number'&&strM.includes(m[2]))this.diags.push({level:'error',code:'E0302',message:msg('E0302',{id:m[1],type:'number',method:m[2]}),hint:`String(${m[1]}) に変換してください`,context:ctx});}}this.checkVars(n.expr, ctx);}
  checkVars(expr, ctx=''){const reserved=new Set(['true','false','null','undefined','void','typeof','instanceof','new','return','if','else','for','while','const','let','var','function','class','this','super','import','export','from','await','async','try','catch','finally','throw','length','map','filter','reduce','push','pop','trim','includes','indexOf','slice','splice','concat','join','split','toFixed','toString','toUpperCase','toLowerCase','replace','match','startsWith','endsWith','parseInt','parseFloat','String','Number','Boolean','Array','Object','Math','JSON','console','window','document','fetch','Promise','Date','Error','event','e','r','s','i','t','n','ok','data','error','index']);
    // Strip string literals before extracting identifiers
    const stripped=expr.replace(/"(?:[^"\\]|\\.)*"/g,' ').replace(/'(?:[^'\\]|\\.)*'/g,' ').replace(/`(?:[^`\\]|\\.)*`/g,' ');
    const ids=stripped.match(/\b[a-zA-Z_]\w*\b/g)||[];for(const id of ids){if(reserved.has(id)||this.typeAliases.has(id))continue;if(!this.symbols.has(id)){const sug=this.similar(id);this.diags.push({level:'error',code:'E0301',message:msg('E0301',{id:id}),hint:sug?`'${sug}' のことですか？`:undefined,context:ctx});}}}
  // S-17: Validate event handler attributes for code injection attacks
  validateEventHandlerAttr(attr, ctx='') {
    const expr = attr.value.trim();
    // Reject empty
    if (!expr) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_EMPTY'),context:ctx});
      return;
    }
    // Reject keywords that indicate code execution or prototype manipulation
    const dangerousKeywords = ['eval', 'Function(', 'constructor', '__proto__', 'prototype', 'import(', 'require('];
    for (const keyword of dangerousKeywords) {
      if (expr.toLowerCase().includes(keyword.toLowerCase())) {
        this.diags.push({level:'error',code:'E0401',message:msg('E0401_KEYWORD',{keyword:keyword}),context:ctx});
        return;
      }
    }
    // SEC-04: Reject dangerous operators and global access patterns
    const dangerousPatterns = [
      [/\bdelete\s/, 'delete operator'],
      [/\bvoid\s/, 'void operator'],
      [/\bnew\s/, 'new operator'],
      [/\bawait\s/, 'await (use async fn instead)'],
      [/\btypeof\s/, 'typeof operator'],
    ];
    for (const [pattern, reason] of dangerousPatterns) {
      if (pattern.test(expr)) {
        this.diags.push({level:'warning',code:'W0211',message:msg('W0211',{reason:reason}),context:ctx});
      }
    }
    // Reject multiple statements (semicolon)
    if (expr.includes(';')) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_SEMICOLON'),context:ctx});
      return;
    }
    // Reject string literals - these can hide malicious code
    if (/['"`]/.test(expr)) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_STRING'),context:ctx});
      return;
    }
    // Reject template literals (backticks)
    if (expr.includes('`')) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_TEMPLATE_LIT'),context:ctx});
      return;
    }
    // Reject comments
    if (expr.includes('//') || expr.includes('/*')) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_COMMENT'),context:ctx});
      return;
    }
    // Reject destructuring or spread
    if (expr.includes('...') || expr.includes('[') || expr.includes(']')) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_DESTRUCTURE'),context:ctx});
      return;
    }
    // Reject regex literals
    if (/\/.*\/[gimsuvy]*/.test(expr)) {
      this.diags.push({level:'error',code:'E0401',message:msg('E0401_REGEX'),context:ctx});
      return;
    }
    // At this point, we allow simple identifiers, function calls, and assignments
    // No further validation needed - this will be caught at code generation if invalid
  }
  checkUnused(){const used=new Set();this.collectRefs(this.c.template,used);for(const d of this.c.script){if(d.kind==='computed')(d.expr.match(/\b\w+\b/g)||[]).forEach(w=>used.add(w));if(d.kind==='fn')(d.body.match(/\b\w+\b/g)||[]).forEach(w=>used.add(w));if(d.kind==='watch'){d.deps.forEach(dep=>used.add(dep));(d.body.match(/\b\w+\b/g)||[]).forEach(w=>used.add(w));}}for(const[name,sym]of this.symbols)if(sym.source==='state'&&!used.has(name))this.diags.push({level:'warning',code:'W0101',message:msg('W0101',{id:name})});}
  collectRefs(nodes,refs){for(const n of nodes){if(n.kind==='interpolation')(n.expr.match(/\b\w+\b/g)||[]).forEach(w=>refs.add(w));else if(n.kind==='element'){n.attrs.forEach(a=>{if(a.dynamic||a.event||a.bind)(a.value.match(/\b\w+\b/g)||[]).forEach(w=>refs.add(w));});this.collectRefs(n.children,refs);}else if(n.kind==='if'){(n.condition.match(/\b\w+\b/g)||[]).forEach(w=>refs.add(w));this.collectRefs(n.children,refs);if(n.elseIfChain)for(const branch of n.elseIfChain){(branch.condition.match(/\b\w+\b/g)||[]).forEach(w=>refs.add(w));this.collectRefs(branch.children,refs);}if(n.elseChildren)this.collectRefs(n.elseChildren,refs);}else if(n.kind==='for'){(n.of.match(/\b\w+\b/g)||[]).forEach(w=>refs.add(w));this.collectRefs(n.children,refs);if(n.emptyChildren)this.collectRefs(n.emptyChildren,refs);}}}
  infer(e){e=e.trim();if(/^-?\d+(\.\d+)?$/.test(e))return{kind:'primitive',name:'number'};if(/^["'`]/.test(e))return{kind:'primitive',name:'string'};if(e==='true'||e==='false')return{kind:'primitive',name:'boolean'};if(e==='null')return{kind:'primitive',name:'null'};if(e==='[]')return{kind:'array',element:{kind:'primitive',name:'any'}};if(e.startsWith('['))return{kind:'array',element:{kind:'primitive',name:'string'}};if(e.startsWith('new Map'))return{kind:'generic',name:'Map',typeArgs:[{kind:'primitive',name:'any'},{kind:'primitive',name:'any'}]};if(e.startsWith('new Set'))return{kind:'generic',name:'Set',typeArgs:[{kind:'primitive',name:'any'}]};const sym=this.symbols.get(e);return sym?sym.type:null;}
  assignable(from,to){
    // 'any' is always assignable
    if(from.kind==='primitive'&&from.name==='any') return true;
    if(to.kind==='primitive'&&to.name==='any') return true;
    // Generic type parameter names are treated as 'any' (type-erasure at runtime)
    if(to.kind==='primitive'&&this.c.meta.generics&&this.c.meta.generics.some(g=>g.name===to.name)) return true;
    if(from.kind==='primitive'&&this.c.meta.generics&&this.c.meta.generics.some(g=>g.name===from.name)) return true;
    // Array<T> is assignable to T[] and vice versa
    if(from.kind==='array'&&to.kind==='generic'&&to.name==='Array'&&to.typeArgs.length===1) {
      return this.assignable(from.element, to.typeArgs[0]);
    }
    if(from.kind==='generic'&&from.name==='Array'&&from.typeArgs.length===1&&to.kind==='array') {
      return this.assignable(from.typeArgs[0], to.element);
    }
    // Same type and kind
    if(from.kind===to.kind) {
      if(from.kind==='primitive') return from.name===to.name;
      if(from.kind==='array') return this.assignable(from.element, to.element);
      if(from.kind==='generic') {
        if(from.name!==to.name) return false;
        if(from.typeArgs.length!==to.typeArgs.length) return false;
        return from.typeArgs.every((a,i)=>this.assignable(a,to.typeArgs[i]));
      }
      if(from.kind==='union') {
        return from.types.every(t => this.assignable(t, to));
      }
      if(from.kind==='object') {
        if(!to.fields) return false;
        for(const ff of from.fields) {
          const tf = to.fields.find(f => f.name === ff.name);
          if(!tf && !ff.optional) return false;
          if(tf && !this.assignable(ff.type, tf.type)) return false;
        }
        return true;
      }
      return true;
    }
    // Union type: check if 'from' matches any member of 'to'
    if(to.kind==='union') {
      return to.types.some(t => this.assignable(from, t));
    }
    // String primitive is assignable to string literal (default values like "primary" match "primary"|"secondary")
    if(from.kind==='primitive'&&from.name==='string'&&to.kind==='literal') return true;
    // Number primitive is assignable to number literal
    if(from.kind==='primitive'&&from.name==='number'&&to.kind==='literal'&&/^\d/.test(to.value)) return true;
    return false;
  }
  similar(name){let best=null,bd=Infinity;for(const[k]of this.symbols){const d=lev(name,k);if(d<bd&&d<=2){bd=d;best=k;}}return best;}
}
function lev(a,b){const m=a.length,n=b.length,dp=Array.from({length:m+1},()=>Array(n+1).fill(0));for(let i=0;i<=m;i++)dp[i][0]=i;for(let j=0;j<=n;j++)dp[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return dp[m][n];}

// ============================================================
// Type Utilities
// ============================================================

/**
 * Convert internal type AST to TypeScript type string.
 *
 * Used for:
 * - Generating .d.ts type declarations
 * - Generating TypeScript annotations in generated code
 *
 * @param {Object} t - Type AST object
 * @returns {string} TypeScript type string
 * @example
 * typeToTs({kind: 'primitive', name: 'string'})          // 'string'
 * typeToTs({kind: 'array', element: {...}})              // 'T[]'
 * typeToTs({kind: 'union', types: [{...}, {...}]})        // 'T | U'
 * typeToTs({kind: 'object', fields: [{name: 'x', ...}]}) // '{ x: T }'
 */
function typeToTs(t) {
  if (!t) return 'any';
  switch (t.kind) {
    case 'primitive':
      return t.name;
    case 'array':
      return `${typeToTs(t.element)}[]`;
    case 'union':
      return t.types.map(typeToTs).join(' | ');
    case 'literal':
      return `"${t.value}"`;
    case 'generic':
      return `${t.name}<${t.typeArgs.map(typeToTs).join(', ')}>`;
    case 'object': {
      const fields = t.fields.map(f => `${f.name}${f.optional ? '?' : ''}: ${typeToTs(f.type)}`);
      return `{ ${fields.join('; ')} }`;
    }
    default:
      return 'any';
  }
}

/**
 * Generate TypeScript type declaration (.d.ts) for the compiled component.
 *
 * Creates:
 * - JSX.IntrinsicElements declaration for JSX support
 * - Props interface (all prop declarations)
 * - Events interface (all emit declarations)
 * - Class declaration with property getters
 * - Global HTMLElementTagNameMap entry
 *
 * Used when target is 'ts' to provide full TypeScript support.
 *
 * @param {Object} c - Component AST
 * @returns {string} TypeScript .d.ts file content
 * @description
 * .d.ts ファイルはコンポーネントの型情報を提供し、
 * IDEのオートコンプリートと型チェックを有効にします。
 */
function generateDts(c) {
  const className = c.meta.name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const tagName = c.meta.name;

  // Build generic parameter string
  const generics = c.meta.generics || [];
  const genericStr = generics.length > 0
    ? '<' + generics.map(g => {
        let s = g.name;
        if (g.constraint) s += ' extends ' + typeToTs(g.constraint);
        if (g.default) s += ' = ' + typeToTs(g.default);
        return s;
      }).join(', ') + '>'
    : '';

  let dts = `// Auto-generated type declarations for ${tagName}\n\n`;
  dts += `declare global {\n`;
  dts += `  namespace JSX {\n`;
  dts += `    interface IntrinsicElements {\n`;
  dts += `      '${tagName}': ${tagName}Props & React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;\n`;
  dts += `    }\n`;
  dts += `  }\n`;
  dts += `}\n\n`;

  // Props interface
  const props = c.script.filter(d => d.kind === 'prop');
  if (props.length > 0) {
    dts += `export interface ${tagName}Props${genericStr} {\n`;
    for (const p of props) {
      dts += `  ${p.name}?: ${typeToTs(p.type)};\n`;
    }
    dts += `}\n\n`;
  }

  // Events interface
  const events = c.script.filter(d => d.kind === 'emit');
  if (events.length > 0) {
    dts += `export interface ${tagName}Events${genericStr} {\n`;
    for (const e of events) {
      dts += `  on${e.name.charAt(0).toUpperCase() + e.name.slice(1)}: (detail: ${typeToTs(e.type)}) => void;\n`;
    }
    dts += `}\n\n`;
  }

  // Main element class
  dts += `export declare class ${className}${genericStr} extends HTMLElement {\n`;
  for (const p of props) {
    dts += `  ${p.name}: ${typeToTs(p.type)};\n`;
  }
  dts += `}\n\n`;
  dts += `declare global {\n`;
  dts += `  interface HTMLElementTagNameMap {\n`;
  dts += `    '${tagName}': ${className};\n`;
  dts += `  }\n`;
  dts += `}\n\n`;
  dts += `export {};\n`;

  return dts;
}

// ============================================================
// PHASE 4: Code Generator
// ============================================================

/**
 * Generate Web Component class code from the component AST.
 *
 * Produces a class that extends HTMLElement with:
 * - Private fields for state, props, computed, refs
 * - Getters/setters for props with attribute observation
 * - Methods for event emission and lifecycle hooks
 * - Template rendering via innerHTML with dynamic expressions
 * - Event binding system using data-chasket-id attributes
 * - Watch dependency tracking and change detection
 * - XSS/injection prevention through HTML escaping
 *
 * The generated code is wrapped in an IIFE for module isolation
 * and uses a deferred registration queue for bundle mode.
 *
 * @param {Object} c - Component AST
 * @param {Object} [options] - Code generation options {target: 'ts'|'js'}
 * @returns {string} Generated Web Component class code
 * @description
 * 生成されたコンポーネントの特徴:
 * - プライベートフィールド (#field) で内部状態を隠蔽
 * - イベント結合システムで動的 ID を使用した効率的なバインディング
 * - Watch の依存性を追跡して必要な時だけ実行
 * - テンプレートリテラルを使用した高速なレンダリング
 * - XSS 対策のための複数レベルのエスケープ (#esc, #escAttr, #escUrl)
 */
function generate(c, options) {
  const ts = options?.target === 'ts';  // Generate TypeScript annotations?
  const optimize = options?.optimize === true;  // Enable helper method tree-shaking?

  // Track which helper methods are actually used
  const usedHelpers = new Set();

  // Collect all declaration names by type for later replacement
  const sv=[],    // state variable names
        pv=[],    // prop names
        cv=[],    // computed property names
        en=[],    // emit event names
        rn=[],    // ref names
        fn=[],    // function names
        prov=[],  // provide names
        cons=[],  // consume names
        cn_vars=[]; // const/let variable names

  for(const d of c.script){
    switch(d.kind){
      case'state':sv.push(d.name);break;
      case'prop':pv.push(d.name);break;
      case'computed':cv.push(d.name);break;
      case'emit':en.push(d.name);break;
      case'ref':rn.push(d.name);break;
      case'fn':fn.push(d.name);break;
      case'provide':prov.push(d.name);sv.push(d.name);break;
      case'consume':cons.push(d.name);break;
      case'const':case'let':cn_vars.push(d.name);break;
    }
  }
  // Register helper names from <meta> block so tx() transforms them to this.#name()
  if(c.meta.helpers){for(const h of c.meta.helpers)fn.push(h.name);}

  // Track elements with missing close tags for diagnostic reporting
  const missingCloseTagElements = [];

  // ─── Event binding ID generator ───
  // Defense-in-depth: sanitize component name in nextEid even though input validation ensures [a-z0-9-]
  let _eid = 0;
  function nextEid() { return `fl-${tn.replace(/[^a-z0-9-]/g, '')}-${_eid++}`; }

  /**
   * String-aware identifier replacement helper.
   *
   * Critical function: Replaces identifiers with their private field equivalents
   * (e.g., count -> this.#count) but SKIPS replacements inside string literals.
   *
   * This prevents bugs like:
   * - emit("count") from becoming emit("this.#count")
   * - "the count is" from becoming "the this.#count is"
   *
   * Algorithm:
   * 1. Scan expression and partition into string and non-string regions
   * 2. For string regions: preserve as-is
   * 3. For non-string regions: apply all regex replacements
   * 4. Join partitions back together
   *
   * Special handling for template literals: Track ${} expressions as non-string
   * so replacements work inside template interpolations.
   *
   * @param {string} expr - JavaScript expression to transform
   * @param {Array<[RegExp, string]>} replacements - [[pattern, replacement], ...]
   * @returns {string} Transformed expression
   * @description
   * この関数は最も重要な変換関数です。
   * 文字列内の置き換えを避けることで、バグを防ぎます。
   */
  function txSafe(expr, replacements) {
    // Partition expression into string and non-string regions
    // For template literals, further partition to separate ${}  expressions
    const parts = [];
    let i = 0;

    // Helper: Parse a template literal and return its parts
    function scanTemplateLiteral(expr, startIdx) {
      const tplParts = [];
      let j = startIdx + 1; // Skip opening backtick
      let lastPartEnd = startIdx + 1; // End of last text part

      while (j < expr.length) {
        if (expr[j] === '\\') {
          j += 2;
          continue;
        }
        if (expr[j] === '`') {
          // End of template literal
          if (lastPartEnd < j) {
            tplParts.push({ text: expr.substring(lastPartEnd, j), isString: true });
          }
          return { endIdx: j + 1, parts: tplParts };
        }

        // Check for ${...} expression
        if (expr[j] === '$' && expr[j+1] === '{') {
          // Save the string part before ${
          if (lastPartEnd < j) {
            tplParts.push({ text: expr.substring(lastPartEnd, j), isString: true });
          }

          // Find matching }
          let depth = 1;
          j += 2;
          const exprStart = j;

          while (j < expr.length && depth > 0) {
            if (expr[j] === '\\') { j += 2; continue; }
            // Handle strings/template literals inside ${}
            if (expr[j] === '"' || expr[j] === "'" || expr[j] === '`') {
              const q = expr[j];
              j++;
              while (j < expr.length) {
                if (expr[j] === '\\') { j += 2; continue; }
                if (expr[j] === q) { j++; break; }
                j++;
              }
              continue;
            }
            if (expr[j] === '{') depth++;
            else if (expr[j] === '}') depth--;
            if (depth > 0) j++;
          }

          const exprText = expr.substring(exprStart, j);
          tplParts.push({ text: exprText, isString: false, isExpr: true });

          if (j < expr.length) j++; // Skip closing }
          lastPartEnd = j;
          continue;
        }

        j++;
      }

      // Malformed: unclosed template literal
      if (lastPartEnd < expr.length) {
        tplParts.push({ text: expr.substring(lastPartEnd), isString: true });
      }
      return { endIdx: expr.length, parts: tplParts };
    }

    while (i < expr.length) {
      const ch = expr[i];

      if (ch === '`') {
        // Template literal: partition into string and expression parts
        const { endIdx, parts: tplParts } = scanTemplateLiteral(expr, i);

        // Add opening backtick
        let templateContent = '`';

        // Process each part of the template
        for (const part of tplParts) {
          if (part.isString) {
            // String parts remain unchanged
            templateContent += part.text;
          } else if (part.isExpr) {
            // Expression parts: apply replacements
            let exprContent = part.text;
            for (const [pattern, replacement] of replacements) {
              exprContent = exprContent.replace(pattern, replacement);
            }
            templateContent += '${' + exprContent + '}';
          }
        }

        // Add closing backtick
        templateContent += '`';

        parts.push({ text: templateContent, isString: true }); // Treat whole template as string
        i = endIdx;
      } else if (ch === '"' || ch === "'") {
        // Regular string literal (not template): find matching close quote
        const quote = ch;
        let j = i + 1;
        while (j < expr.length) {
          if (expr[j] === '\\') { j += 2; continue; }
          if (expr[j] === quote) { j++; break; }
          j++;
        }
        parts.push({ text: expr.substring(i, j), isString: true });
        i = j;
      } else {
        // Non-string: scan until next quote
        let j = i;
        while (j < expr.length && expr[j] !== '"' && expr[j] !== "'" && expr[j] !== '`') j++;
        parts.push({ text: expr.substring(i, j), isString: false });
        i = j;
      }
    }

    // Apply replacements only to non-string parts
    return parts.map(p => {
      if (p.isString) return p.text;
      let t = p.text;
      for (const [pattern, replacement] of replacements) {
        t = t.replace(pattern, replacement);
      }
      return t;
    }).join('');
  }

  /**
   * Build list of identifier replacement patterns.
   *
   * Creates regex patterns to transform user code:
   * - state count -> this.#count (access private field)
   * - prop title -> this.#prop_title (access prop backing field)
   * - computed doubled -> this.#doubled (call getter)
   * - emit(change) -> this.#emit_change( (call emit method)
   * - fn increment() -> this.#increment() (call method)
   * - ref inputEl -> this.#inputEl (access ref)
   * - consume user -> this.#user (access consume value)
   *
   * Uses negative lookbehind (?<!#) to avoid double-prefixing (this.##field)
   *
   * Sorts by length (longest first) to avoid partial matches.
   *
   * @returns {Array<[RegExp, string]>} Replacement patterns
   */
  // S-02: Escape RegExp metacharacters to prevent RegExp injection
  function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildReplacements() {
    const reps = [];
    // Sort all identifiers by length (longest first) to prevent partial matches
    // e.g., "count" before "c" to avoid matching 'c' in 'count'
    const allIds = [...new Set([...sv, ...pv, ...cv, ...en, ...fn, ...rn, ...cons])];
    allIds.sort((a, b) => b.length - a.length);

    // State variables: myVar -> this.#myVar
    // (?<!(?<!\.)\.|\#) ensures we don't replace property accesses like obj.filter
    // or already-prefixed #filter, but DO replace after spread operator (...)
    for(const s of sv) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(s)}\\b`,'g'), `this.#${s}`]);

    // Props: title -> this.#prop_title (props stored in separate fields)
    for(const p of pv) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(p)}\\b`,'g'), `this.#prop_${p}`]);

    // Computed: doubled -> this.#doubled (calls private getter)
    for(const v of cv) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(v)}\\b`,'g'), `this.#${v}`]);

    // Emit: emit(change) -> this.#emit_change( (calls emit method)
    for(const e of en) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(e)}\\(`,'g'), `this.#emit_${e}(`]);

    // Functions: increment() -> this.#increment() (calls private method)
    for(const f of fn) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(f)}\\(`,'g'), `this.#${f}(`]);

    // Refs: inputEl -> this.#inputEl (access private ref field)
    for(const ref of rn) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(ref)}\\b`,'g'), `this.#${ref}`]);

    // Consume: user -> this.#user (access consumed context value)
    for(const co of cons) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(co)}\\b`,'g'), `this.#${co}`]);

    // Const/Let: myConst -> this.#myConst (access private field)
    for(const v of cn_vars) reps.push([new RegExp(`(?<!(?<!\\.)\\.|\\#)\\b${escRx(v)}\\b`,'g'), `this.#${v}`]);

    // Form-associated helpers: setFormValue() -> this.#setFormValue(), setValidity() -> this.#setValidity()
    if (c.meta.form) {
      reps.push([/(?<!#)\bsetFormValue\(/g, 'this.#setFormValue(']);
      reps.push([/(?<!#)\bsetValidity\(/g, 'this.#setValidity(']);
    }

    return reps;
  }

  const _defaultReplacements = buildReplacements();

  /**
   * Transform an expression outside of loop context.
   * Applies all identifier replacements using txSafe().
   */
  function tx(expr){ return txSafe(expr, _defaultReplacements); }

  /**
   * Transform a code body (watch/fn/lifecycle) with local variable awareness.
   * Extracts const/let/var declarations from the body and excludes those
   * identifiers from replacement to preserve local scoping.
   *
   * Without this, `const el = ...` inside a watch block would become
   * `const this.#el = ...` if `el` is also a known ref/state name.
   *
   * SEC-02: Handles nested destructuring, for-loop variables, and
   * TypeScript type annotations.
   */
  function txBody(body) {
    const locals = new Set();

    /**
     * Extract binding names from a destructuring pattern string.
     * Handles nested patterns like { a: { b: c }, d } or [a, [b, c]].
     */
    function extractBindings(pattern) {
      // Remove outer brackets/braces
      const trimmed = pattern.trim();
      if (!trimmed) return;

      if (trimmed[0] === '{') {
        // Object destructuring — find matching }
        const inner = extractBalanced(trimmed, '{', '}');
        if (!inner) return;
        // Split on top-level commas only
        for (const part of splitTopLevel(inner, ',')) {
          const p = part.trim();
          if (!p) continue;
          // "key: value" or "key: { nested }" or "key: [nested]" or just "key"
          const colonIdx = findTopLevelColon(p);
          if (colonIdx !== -1) {
            // Has rename/nested: extract the value part
            const value = p.substring(colonIdx + 1).trim();
            if (value[0] === '{' || value[0] === '[') {
              extractBindings(value);
            } else {
              // Simple rename: const { a: b } = ... → b is the local
              const name = value.split('=')[0].trim(); // Handle defaults
              if (/^\w+$/.test(name)) locals.add(name);
            }
          } else {
            // No colon: just a name, possibly with default
            const name = p.split('=')[0].trim();
            if (name[0] === '{' || name[0] === '[') {
              extractBindings(name);
            } else if (/^\w+$/.test(name)) {
              locals.add(name);
            }
          }
        }
      } else if (trimmed[0] === '[') {
        // Array destructuring — find matching ]
        const inner = extractBalanced(trimmed, '[', ']');
        if (!inner) return;
        for (const part of splitTopLevel(inner, ',')) {
          const p = part.trim();
          if (!p) continue;
          if (p.startsWith('...')) {
            // Rest element: const [...rest] = ...
            const name = p.substring(3).trim();
            if (/^\w+$/.test(name)) locals.add(name);
          } else if (p[0] === '{' || p[0] === '[') {
            extractBindings(p);
          } else {
            const name = p.split('=')[0].trim();
            if (/^\w+$/.test(name)) locals.add(name);
          }
        }
      }
    }

    /** Extract content between balanced open/close chars */
    function extractBalanced(str, open, close) {
      if (str[0] !== open) return null;
      let depth = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === open) depth++;
        else if (str[i] === close) { depth--; if (depth === 0) return str.substring(1, i); }
      }
      return null; // Unbalanced
    }

    /** Split string on a delimiter, but only at top level (respecting {}, [], ()) */
    function splitTopLevel(str, delim) {
      const parts = [];
      let depth = 0, start = 0;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') depth--;
        else if (ch === delim && depth === 0) {
          parts.push(str.substring(start, i));
          start = i + 1;
        }
      }
      parts.push(str.substring(start));
      return parts;
    }

    /** Find first colon at top nesting level (for object destructuring key: value) */
    function findTopLevelColon(str) {
      let depth = 0;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') depth--;
        else if (ch === ':' && depth === 0) return i;
      }
      return -1;
    }

    // ─── Scan body for variable declarations ───
    // Match: const/let/var followed by identifier, {destructure}, or [destructure]
    // Also match: for (const/let/var ... of/in ...)
    const declPattern = /\b(?:const|let|var)\s+/g;
    let dm;
    while ((dm = declPattern.exec(body)) !== null) {
      const after = body.substring(dm.index + dm[0].length);

      if (after[0] === '{' || after[0] === '[') {
        // Destructuring: find the balanced closing bracket
        const open = after[0], close = open === '{' ? '}' : ']';
        const inner = extractBalanced(after, open, close);
        if (inner !== null) {
          extractBindings(open + inner + close);
        }
      } else {
        // Simple declaration or comma-separated: const a = 1, b = 2
        // Also handles: for (const x of arr)
        const match = after.match(/^(\w+)/);
        if (match) {
          locals.add(match[1]);
          // Scan for additional comma-separated declarators
          const restStart = match[0].length;
          const rest = after.substring(restStart);
          // Look for pattern: = expr, name2 = expr2, ...
          const commaDecls = rest.match(/,\s*(\w+)\s*(?=[=;,)])/g);
          if (commaDecls) {
            for (const cd of commaDecls) {
              const nm = cd.match(/,\s*(\w+)/);
              if (nm) locals.add(nm[1]);
            }
          }
        }
      }
    }

    // Also detect function parameters and arrow function params
    // fn process(items) { ... } — 'items' param comes from parseScript, not here
    // But catch: arr.forEach((item) => { ... })  or  arr.map(x => x)
    const arrowPattern = /\(([^)]*)\)\s*=>/g;
    let am;
    while ((am = arrowPattern.exec(body)) !== null) {
      const params = am[1];
      for (const p of params.split(',')) {
        const name = p.trim().replace(/^\.\.\./, '').split('=')[0].split(':')[0].trim();
        if (/^\w+$/.test(name) && name !== '') locals.add(name);
      }
    }
    // Single-param arrow: item => ...
    const singleArrow = /(?<![.\w])(\w+)\s*=>/g;
    let sa;
    while ((sa = singleArrow.exec(body)) !== null) {
      locals.add(sa[1]);
    }

    if (locals.size === 0) return tx(body);

    // Filter out replacements that match local variable names
    const filteredReps = _defaultReplacements.filter(([pattern]) => {
      const src = pattern.source;
      const idMatch = src.match(/\\b(\w+)\\b/);
      if (idMatch && locals.has(idMatch[1])) return false;
      return true;
    });

    return txSafe(body, filteredReps);
  }

  // ─── Helper utility functions ───

  /**
   * Convert kebab-case tag name to PascalCase class name.
   * e.g., 'my-component' -> 'MyComponent'
   */
  function tagToClass(t){return t.split('-').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join('');}

  /**
   * Convert camelCase to kebab-case.
   * e.g., 'myProp' -> 'my-prop'
   * Used to map JavaScript properties to HTML attributes.
   */
  function camelToKebab(s){return s.replace(/([A-Z])/g,'-$1').toLowerCase();}

  /**
   * Minify CSS by removing unnecessary whitespace.
   * Not for security, just code size reduction.
   */
  function minCss(css){return css.replace(/\s+/g,' ').replace(/\s*{\s*/g,'{').replace(/\s*}\s*/g,'}').replace(/\s*:\s*/g,':').replace(/\s*;\s*/g,';').trim();}

  /**
   * Scope CSS selectors for shadow: none mode.
   *
   * shadow: none ではShadow DOMによるスタイル隔離がないため、
   * セレクタにスコープ属性を付与してスタイル衝突を防止する。
   *
   * 変換例:
   *   .card { ... }              → [data-chasket-scope="x-card"] .card { ... }
   *   h2 { ... }                 → [data-chasket-scope="x-card"] h2 { ... }
   *   :host { ... }              → [data-chasket-scope="x-card"] { ... }
   *   :host(.active) { ... }     → [data-chasket-scope="x-card"].active { ... }
   *   .a, .b { ... }             → [data-chasket-scope="x-card"] .a, [data-chasket-scope="x-card"] .b { ... }
   *
   * @param {string} css - 元のCSS
   * @param {string} tagName - コンポーネントのタグ名（例: "x-card"）
   * @returns {string} スコープ付きCSS
   */
  function scopeCss(css, tagName) {
    // S-01: Sanitize tagName for CSS selector to prevent CSS injection
    // S-19: Escape tagName value for use in CSS attribute selector to prevent CSS injection
    // Even though tagName is validated, we add defense-in-depth by escaping
    // Special characters in CSS strings: backslash (\), quotes ("), newline (\n), etc.
    const safeName = tagName
      .replace(/[^a-z0-9\-]/g, '') // Remove non-alphanumeric except hyphen
      .replace(/\\/g, '\\\\')       // Escape backslashes first
      .replace(/"/g, '\\"');        // Escape double quotes for CSS string context
    const scope = `[data-chasket-scope="${safeName}"]`;
    // Split CSS into rules (respecting nested braces for @media etc.)
    const rules = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < css.length; i++) {
      const ch = css[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { rules.push(current + '}'); current = ''; continue; } }
      current += ch;
    }
    if (current.trim()) rules.push(current);

    return rules.map(rule => {
      const m = rule.match(/^([^{]+)\{([\s\S]*)\}$/);
      if (!m) return rule;
      const selectorPart = m[1].trim();
      const body = m[2];

      // Handle @media, @keyframes etc. — recurse into the body
      // Strip CSS comments before checking for @ prefix (comments can precede @media)
      const selectorClean = selectorPart.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (selectorClean.startsWith('@')) {
        return `${selectorPart} { ${scopeCss(body, tagName)} }`;
      }

      // Split comma-separated selectors and scope each
      const selectors = selectorPart.split(',').map(s => s.trim());
      const scoped = selectors.map(sel => {
        // :host pseudo-class — maps to the scoped element itself
        if (sel === ':host') return scope;
        if (sel.startsWith(':host(') && sel.endsWith(')')) {
          // :host(.active) → [data-chasket-scope="x-card"].active
          return scope + sel.slice(6, -1);
        }
        // :host with pseudo-class or pseudo-element (e.g., :host.active, :host:hover)
        if (sel.startsWith(':host')) {
          const rest = sel.slice(5); // Remove ':host' prefix
          return scope + rest;
        }
        // Already starts with scope? skip
        if (sel.startsWith('[data-chasket-scope')) return sel;
        // Normal selector: prepend scope
        return `${scope} ${sel}`;
      });
      return `${scoped.join(', ')} {${body}}`;
    }).join('\n');
  }

  /**
   * Event binding registry.
   *
   * Each element with events (@click, @change, :bind) gets a unique data-chasket-id
   * that's used to find and bind event listeners during #render().
   *
   * Structure: {
   *   eid: "fl-0",
   *   events: [{name: "click", value: "handler", modifiers: [...]}],
   *   binds: [{value: "state.field"}],
   *   inLoop: false,
   *   loopCtx: null
   * }
   *
   * When inLoop=true, eid is dynamic: "fl-0-${index}"
   */
  const eventBindings = [];

  /**
   * Convert template AST nodes to template literal string.
   *
   * Recursively generates a template string that can be used in:
   * tpl.innerHTML = `...generated template...`
   *
   * Each node type generates different code:
   * - text: literal text
   * - interpolation: ${this.#esc(expr)} with escaping
   * - element: <tag attr="${value}">...</tag> with dynamic attributes
   * - if/for: ternary/map expressions
   *
   * @param {Array} nodes - Template AST nodes
   * @param {number} indent - Current indentation level
   * @param {Object} loopCtx - Loop context (if inside <#for>)
   * @returns {string} Template literal code
   */
  function tplStr(nodes,indent,loopCtx,raw){
    const pad=raw?'':' '.repeat(indent);
    const nl=raw?'':'\n';
    let o='';
    for(const n of nodes){
      switch(n.kind){
        case'text':
          if(raw){
            // In raw (preformatted) mode: preserve text exactly, only escape template literal chars
            const escaped = n.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
            o+=escaped;
          } else if(n.value.trim()){
            // テンプレートリテラル内に埋め込むため ` と ${ をエスケープ
            const escaped = n.value.trim().replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
            o+=`${pad}${escaped}\n`;
          }
          break;
        case'interpolation':
          // Interpolations are always escaped to prevent XSS
          if(optimize)usedHelpers.add('esc');
          o+=`${pad}\${this.#esc(${loopCtx?txLoop(n.expr,loopCtx):tx(n.expr)})}${nl}`;
          break;
        case'rawInterpolation':
          // Raw interpolation {{{ }}} — no escaping, user takes XSS responsibility
          o+=`${pad}\${${loopCtx?txLoop(n.expr,loopCtx):tx(n.expr)}}${nl}`;
          break;
        case'element':
          o+=elStr(n,indent,loopCtx,raw);
          break;
        case'if':
          o+=ifStr(n,indent,loopCtx);
          break;
        case'for':
          o+=forStr(n,indent,loopCtx);
          break;
      }
    }
    return o;
  }

  /**
   * Transform expression inside a loop context.
   *
   * Same as tx() but excludes loop variables from transformation
   * so they remain accessible in the loop scope.
   *
   * Example: inside <#for each="item"> loop, "item" should NOT
   * become "this.#item" because it's a loop variable.
   *
   * @param {string} expr - Expression to transform
   * @param {Object} loopCtx - Loop context {each, index, of}
   * @returns {string} Transformed expression
   */
  function txLoop(expr, loopCtx) {
    const reps = [];
    for(const s of sv) {
      if (s === loopCtx.each || s === loopCtx.index) continue;
      reps.push([new RegExp(`\\b${s}\\b`,'g'), `this.#${s}`]);
    }
    for(const p of pv) {
      if (p === loopCtx.each || p === loopCtx.index) continue;
      reps.push([new RegExp(`\\b${p}\\b`,'g'), `this.#prop_${p}`]);
    }
    for(const v of cv) {
      if (v === loopCtx.each || v === loopCtx.index) continue;
      reps.push([new RegExp(`\\b${v}\\b`,'g'), `this.#${v}`]);
    }
    for(const e of en) reps.push([new RegExp(`\\b${e}\\(`,'g'), `this.#emit_${e}(`]);
    for(const f of fn) reps.push([new RegExp(`\\b${f}\\(`,'g'), `this.#${f}(`]);
    for(const ref of rn) {
      if (ref === loopCtx.each || ref === loopCtx.index) continue;
      reps.push([new RegExp(`\\b${ref}\\b`,'g'), `this.#${ref}`]);
    }
    return txSafe(expr, reps);
  }

  /**
   * Generate template string for an element node.
   *
   * Handles:
   * - Static attributes: class="value"
   * - Dynamic attributes: :class="${expr}"
   * - Directives: :bind (two-way), @event (event binding), ref (DOM reference)
   * - Special attributes: @html (unescaped), :...spread (spread props)
   * - Security: href/src sanitization, attribute escaping
   * - Custom elements: must use closing tag (not self-closing)
   * - Data attributes: data-chasket-id for event binding, data-ref for refs
   *
   * @param {Object} n - Element node
   * @param {number} indent - Indentation level
   * @param {Object} loopCtx - Loop context (if in <#for>)
   * @returns {string} Generated template code for element
   */
  function elStr(n,indent,loopCtx,raw){
    const pad=' '.repeat(indent);

    // Check for unclosed elements (parse error)
    if (n._missingCloseTag) {
      missingCloseTagElements.push(n.tag);
    }
    const evAttrs=n.attrs.filter(a=>a.event);
    const bindAttrs=n.attrs.filter(a=>a.bind);
    const hasEvents = evAttrs.length > 0 || bindAttrs.length > 0;
    let eid = null;

    if (hasEvents) {
      if (loopCtx) {
        // Inside a loop: use dynamic eid with loop index
        eid = nextEid();
        eventBindings.push({
          eid, events: evAttrs, binds: bindAttrs,
          inLoop: true, loopCtx: { ...loopCtx },
        });
      } else {
        eid = nextEid();
        eventBindings.push({
          eid, events: evAttrs, binds: bindAttrs,
          inLoop: false, loopCtx: null,
        });
      }
    }

    let as='';
    // Add data-chasket-id for event targeting
    if (eid && !loopCtx) {
      as += ` data-chasket-id="${eid}"`;
    } else if (eid && loopCtx) {
      // Dynamic id that includes loop index
      as += ` data-chasket-id="${eid}-\${${loopCtx.index || '__idx'}}"`;
    }

    const hasBind = n.attrs.some(a => a.bind);
    // Detect static class + dynamic :class merge scenario
    const staticClassAttr = n.attrs.find(a => !a.dynamic && !a.event && !a.ref && !a.bind && !a.html && a.name === 'class');
    const dynamicClassAttr = n.attrs.find(a => a.dynamic && a.name === 'class');
    const mergeClass = !!(staticClassAttr && dynamicClassAttr);

    for(const a of n.attrs){
      if(a.event)continue;
      if(a.ref){as+=` data-ref="${a.value}"`;continue;}
      if(a.bind){
        const txExpr = loopCtx ? txLoop(a.value, loopCtx) : tx(a.value);
        if(optimize)usedHelpers.add('escAttr');
        as+=` value="\${this.#escAttr(${txExpr})}"`;
        continue;
      }
      if(a.html)continue;
      if(a.dynamic){
        // :bind already generates value attr, skip duplicate :value
        if(hasBind && a.name === 'value') continue;
        // Security: block dangerous on* event handler attributes (e.g., :onclick, :onmouseover)
        if(/^on[a-z]/i.test(a.name)) continue;
        const txExpr = loopCtx ? txLoop(a.value, loopCtx) : tx(a.value);
        if(a.name==='class'){
          if(optimize)usedHelpers.add('escAttr');
          // Support both object syntax {:class="{ active: isActive }"} and
          // array syntax {:class="['base', isActive && 'active']"} and
          // string syntax {:class="myClass"}
          const classResolver = `((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(${txExpr})`;
          if (mergeClass) {
            // Merge static class="foo" + dynamic :class="bar" into single class attribute
            const sv = staticClassAttr.value ? staticClassAttr.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : '';
            as+=` class="\${this.#escAttr([${JSON.stringify(sv)}, ${classResolver}].filter(Boolean).join(' '))}"`;
          } else {
            as+=` class="\${this.#escAttr(${classResolver})}"`;
          }
        }else if(['disabled','checked','hidden'].includes(a.name))as+=` \${${txExpr} ? '${a.name}' : ''}`;
        // Security: sanitize href/src to block javascript: and data: URLs
        else if(['href','src','action','formaction'].includes(a.name)){if(optimize)usedHelpers.add('escUrl');as+=` ${a.name}="\${this.#escUrl(${txExpr})}"`;
        }else{if(optimize)usedHelpers.add('escAttr');as+=` ${a.name}="\${this.#escAttr(${txExpr})}"`;
        }
      } else {
        // Skip static class if it will be merged with dynamic :class
        if (mergeClass && a.name === 'class') continue;
        // 静的属性値もテンプレートリテラル内に出力されるため ` と ${ をエスケープ
        const sv = a.value ? a.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : '';
        as+=sv?` ${a.name}="${sv}"`:` ${a.name}`;
      }
    }
    const ha=n.attrs.find(a=>a.html);
    const isCustomElement = n.tag.includes('-');
    if(n.selfClosing){
      // Custom elements must NOT use self-closing syntax - browsers ignore it
      if(isCustomElement) return`${pad}<${n.tag}${as}></${n.tag}>\n`;
      return`${pad}<${n.tag}${as} />\n`;
    }
    if(ha){
      // @html is intentionally unescaped - developer opts in to raw HTML
      const txExpr = loopCtx ? txLoop(ha.value, loopCtx) : tx(ha.value);
      return`${pad}<${n.tag}${as}>\${${txExpr}}</${n.tag}>\n`;
    }
    // Custom elements with no children: no whitespace between tags
    if(isCustomElement && n.children.length === 0){
      return`${pad}<${n.tag}${as}></${n.tag}>\n`;
    }
    // Preformatted tags: emit children in raw mode (no added whitespace/indentation)
    // to prevent visible formatting artifacts in <pre>, <textarea>
    const preformattedTags = new Set(['pre', 'textarea']);
    const isRaw = raw || preformattedTags.has(n.tag);
    if(isRaw){
      // raw が親から伝播した子要素（<pre> 内の <span> 等）は trailing \n を付けない
      // <pre> / <textarea> 自体は外側の整形のために \n を付ける
      const trailingNl = preformattedTags.has(n.tag) ? '\n' : '';
      return`${pad}<${n.tag}${as}>${tplStr(n.children,0,loopCtx,true)}</${n.tag}>${trailingNl}`;
    }
    // Inline elements: emit children in raw mode (no added whitespace/indentation/newlines)
    // to prevent unwanted spaces in rendered text (e.g., <code> .csk </code> → ".csk" not " .csk ")
    const inlineTags = new Set(['code','span','a','strong','em','b','i','u','s','small','sub','sup','abbr','cite','mark','time','label','q','kbd','var','samp','data','ruby','rt','rp','bdi','bdo','wbr']);
    if(inlineTags.has(n.tag)){
      return`<${n.tag}${as}>${tplStr(n.children,0,loopCtx,true)}</${n.tag}>`;
    }
    // Mixed inline content: when a block element has text nodes alongside inline elements,
    // render all children in raw mode to prevent unwanted whitespace between inline siblings
    const hasMixedInline = n.children.length > 1 && n.children.some(c =>
      c.kind === 'text' || (c.kind === 'element' && inlineTags.has(c.tag)) ||
      c.kind === 'interpolation' || c.kind === 'rawInterpolation'
    ) && n.children.some(c =>
      c.kind === 'element' && inlineTags.has(c.tag)
    );
    if(hasMixedInline){
      return`${pad}<${n.tag}${as}>${tplStr(n.children,0,loopCtx,true)}</${n.tag}>\n`;
    }
    return`${pad}<${n.tag}${as}>\n${tplStr(n.children,indent+2,loopCtx,false)}${pad}</${n.tag}>\n`;
  }

  /**
   * Generate template string for an if/else-if/else block.
   *
   * Uses nested ternary operators to generate:
   * ${condition ? `...content...` : otherCondition ? `...` : `...else...`}
   *
   * @param {Object} n - If node
   * @param {number} indent - Indentation level
   * @param {Object} loopCtx - Loop context
   * @returns {string} Generated ternary expression
   */
  function ifStr(n,indent,loopCtx){
    const pad=' '.repeat(indent);
    const txExpr = loopCtx ? txLoop(n.condition, loopCtx) : tx(n.condition);
    let o=`${pad}\${${txExpr} ? \`\n${tplStr(n.children,indent+2,loopCtx)}`;

    // Handle else-if chain
    if(n.elseIfChain) {
      for(const branch of n.elseIfChain) {
        const branchExpr = loopCtx ? txLoop(branch.condition, loopCtx) : tx(branch.condition);
        o+=`${pad}\` : ${branchExpr} ? \`\n${tplStr(branch.children,indent+2,loopCtx)}`;
      }
    }

    // Final else block
    if(n.elseChildren){
      o+=`${pad}\` : \`\n${tplStr(n.elseChildren,indent+2,loopCtx)}`;
      o+=`${pad}\`}\n`;
    } else {
      o+=`${pad}\` : ''}\n`;
    }
    return o;
  }

  /**
   * Generate template string for a for-loop block.
   *
   * Generates array.map() expression:
   * ${array.map((item, index) => `...content...`).join('')}
   *
   * When emptyChildren provided, uses ternary:
   * ${array.length > 0 ? array.map(...).join('') : `...empty...`}
   *
   * @param {Object} n - For node
   * @param {number} indent - Indentation level
   * @param {Object} loopCtx - Outer loop context (if nested)
   * @returns {string} Generated map expression
   */
  function forStr(n,indent,loopCtx){
    const pad=' '.repeat(indent);
    const le=tx(n.of);  // Array expression
    const idxVar = n.index || '__idx';  // Index variable (default: __idx)
    const forLoopCtx = { each: n.each, index: idxVar, of: n.of };

    if(n.emptyChildren) {
      // Ternary: length > 0 ? map(...) : emptyContent
      return`${pad}\${${le}.length > 0 ? ${le}.map((${n.each}, ${idxVar}) => \`\n${tplStr(n.children,indent+2,forLoopCtx)}${pad}\`).join('') : \`\n${tplStr(n.emptyChildren,indent+2,loopCtx)}${pad}\`}\n`;
    }

    // Direct map without empty check
    return`${pad}\${${le}.map((${n.each}, ${idxVar}) => \`\n${tplStr(n.children,indent+2,forLoopCtx)}${pad}\`).join('')}\n`;
  }

  /**
   * Generate event binding code for #bindEvents() method.
   *
   * Creates querySelector/querySelectorAll calls to find elements by data-chasket-id
   * and attach event listeners.
   *
   * Two modes:
   * 1. Static bindings: querySelector('[data-chasket-id="fl-0"]')
   * 2. Loop bindings: querySelectorAll('[data-chasket-id^="fl-0-"]') with index extraction
   *
   * For each event, generates:
   * - Handler wrapper with event modifiers (prevent, stop, enter, esc)
   * - addEventListener() call
   * - Cleanup registration in this.#listeners
   *
   * @param {string} root - Root element ('this.#shadow' or 'this')
   * @returns {string} Generated event binding code
   * @description
   * イベント結合システムは data-chasket-id を使用して:
   * - テンプレート内のイベントハンドラーを要素に結び付ける
   * - ループ内でも動的 ID でハンドラーを正しく結び付ける
   * - アンマウント時にリッスナーを自動的にクリーンアップする
   */
  /**
   * Resolve a bare handler identifier to its correct call form.
   *
   * fn name -> this.#name(e)    (private method, pass event)
   * state handler -> this.#handler(e)  (state var holding a function, call with event)
   * computed handler -> this.#handler(e)
   * unknown -> this.#name(e)    (fallback, assume method)
   *
   * @param {string} name - The bare identifier
   * @returns {string} Resolved call expression
   */
  function resolveHandler(name) {
    if (fn.includes(name)) {
      // fn declaration → private method call, pass event arg
      return `this.#${name}(e)`;
    }
    if (sv.includes(name)) {
      // state variable holding a function → call the value
      return `(typeof this.#${name} === 'function' ? this.#${name}(e) : this.#${name})`;
    }
    if (pv.includes(name)) {
      // prop (could be a callback from parent)
      return `(typeof this.#prop_${name} === 'function' ? this.#prop_${name}(e) : this.#prop_${name})`;
    }
    if (cv.includes(name)) {
      return `(typeof this.#${name} === 'function' ? this.#${name}(e) : this.#${name})`;
    }
    if (cn_vars.includes(name)) {
      // const/let variable → could hold a function or value
      return `(typeof this.#${name} === 'function' ? this.#${name}(e) : this.#${name})`;
    }
    // Fallback: assume it's a method
    return `this.#${name}(e)`;
  }

  function buildEvtCode(root) {
    let code = '';
    for (const binding of eventBindings) {
      if (binding.inLoop) {
        // Loop bindings: querySelectorAll with prefix match
        const lc = binding.loopCtx;
        const listExpr = tx(lc.of);
        code += `    // Loop event binding: ${binding.eid}\n`;
        code += `    ${root}.querySelectorAll('[data-chasket-id^="${binding.eid}-"]').forEach(el => {\n`;
        code += `      const __idx = parseInt(el.getAttribute('data-chasket-id').split('-').pop(), 10);\n`;

        // P1-17: Track event handler counters for duplicate event names
        const eventCounters = {};
        for (const a of binding.events) {
          let pre = '';
          for (const mod of a.modifiers) {
            if(mod==='prevent')pre+='e.preventDefault(); ';
            if(mod==='stop')pre+='e.stopPropagation(); ';
            if(mod==='enter')pre+="if (e.key !== 'Enter') return; ";
            if(mod==='esc')pre+="if (e.key !== 'Escape') return; ";
          }
          // Build handler - need to resolve loop variable references
          let handlerBody = a.value;
          // Replace loop variable with array access: todo -> this.#todos[__idx]
          // But for function calls like removeTodo(index), transform differently
          let h;
          if(handlerBody.includes('=')&&!handlerBody.includes('=>')&&!handlerBody.includes('==')){
            h=`(e) => { ${pre}${txLoopHandler(handlerBody, lc)}; this.#scheduleUpdate(); }`;
          } else if(handlerBody.includes('(')){
            h=`(e) => { ${pre}${txLoopHandler(handlerBody, lc)}; this.#scheduleUpdate(); }`;
          } else {
            // Bare identifier: resolve using symbol table
            h=`(e) => { ${pre}${resolveHandler(handlerBody)}; this.#scheduleUpdate(); }`;
          }
          // P1-17: Use counter suffix for duplicate event handlers
          const count = eventCounters[a.name] ?? 0;
          eventCounters[a.name] = count + 1;
          const fnName = count === 0 ? `fn_${a.name}` : `fn_${a.name}_${count}`;
          code += `      const ${fnName} = ${h};\n`;
          // S-03: Sanitize event name to prevent code injection via template strings
          const safeEvName = a.name.replace(/[^a-zA-Z0-9\-]/g, '');
          code += `      el.addEventListener('${safeEvName}', ${fnName});\n`;
          code += `      this.#listeners.push([el, '${safeEvName}', ${fnName}]);\n`;
        }

        for (const a of binding.binds) {
          const txExpr = loopCtx ? txLoop(a.value, loopCtx) : tx(a.value);
          code += `      const fn_input = (e) => { ${txExpr} = e.target.value; this.#scheduleUpdate(); };\n`;
          code += `      el.addEventListener('input', fn_input);\n`;
          code += `      this.#listeners.push([el, 'input', fn_input]);\n`;
        }

        code += `    });\n`;
      } else {
        // Static bindings: querySelector with exact match
        code += `    {\n`;
        code += `      const el = ${root}.querySelector('[data-chasket-id="${binding.eid}"]');\n`;
        code += `      if (el) {\n`;

        // P1-17: Track event handler counters for duplicate event names
        const eventCounters = {};
        for (const a of binding.events) {
          let pre = '';
          for (const mod of a.modifiers) {
            if(mod==='prevent')pre+='e.preventDefault(); ';
            if(mod==='stop')pre+='e.stopPropagation(); ';
            if(mod==='enter')pre+="if (e.key !== 'Enter') return; ";
            if(mod==='esc')pre+="if (e.key !== 'Escape') return; ";
          }
          let h;
          if(a.value.includes('=')&&!a.value.includes('=>')&&!a.value.includes('==')){
            h=`(e) => { ${pre}${tx(a.value)}; this.#scheduleUpdate(); }`;
          } else if(a.value.includes('(')){
            h=`(e) => { ${pre}${tx(a.value)}; this.#scheduleUpdate(); }`;
          } else {
            // Bare identifier: resolve using symbol table
            h=`(e) => { ${pre}${resolveHandler(a.value)}; this.#scheduleUpdate(); }`;
          }
          // P1-17: Use counter suffix for duplicate event handlers
          const count = eventCounters[a.name] ?? 0;
          eventCounters[a.name] = count + 1;
          // S-03: Sanitize event name
          const safeEvName2 = a.name.replace(/[^a-zA-Z0-9\-]/g, '');
          const fnName = count === 0 ? `fn_${safeEvName2}` : `fn_${safeEvName2}_${count}`;
          code += `        const ${fnName} = ${h};\n`;
          code += `        el.addEventListener('${safeEvName2}', ${fnName});\n`;
          code += `        this.#listeners.push([el, '${safeEvName2}', ${fnName}]);\n`;
        }

        for (const a of binding.binds) {
          // Preserve focus and cursor position on :bind inputs
          const txExpr = tx(a.value);
          code += `        const fn_input = (e) => { ${txExpr} = e.target.value; this.#updateKeepFocus(el); };\n`;
          code += `        el.addEventListener('input', fn_input);\n`;
          code += `        this.#listeners.push([el, 'input', fn_input]);\n`;
        }

        code += `      }\n`;
        code += `    }\n`;
      }
    }
    return code;
  }

  // Transform handler expression inside loop context
  function txLoopHandler(expr, loopCtx) {
    let r = expr;
    // Replace the index variable (e.g. "index") with __idx
    if (loopCtx.index && loopCtx.index !== '__idx') {
      r = r.replace(new RegExp(`\\b${loopCtx.index}\\b`, 'g'), '__idx');
    }
    // Now apply normal transforms (but skip loop variables in ALL lists)
    const reps = [];
    for(const s of sv) {
      if (s === loopCtx.each || s === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${s}\\b`,'g'), `this.#${s}`]);
    }
    for(const p of pv) {
      if (p === loopCtx.each || p === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${p}\\b`,'g'), `this.#prop_${p}`]);
    }
    for(const v of cv) {
      if (v === loopCtx.each || v === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${v}\\b`,'g'), `this.#${v}`]);
    }
    for(const e of en) {
      if (e === loopCtx.each || e === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${e}\\(`,'g'), `this.#emit_${e}(`]);
    }
    for(const f of fn) {
      if (f === loopCtx.each || f === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${f}\\(`,'g'), `this.#${f}(`]);
    }
    for(const ref of rn) {
      if (ref === loopCtx.each || ref === loopCtx.index) continue;
      reps.push([new RegExp(`(?<!#)\\b${ref}\\b`,'g'), `this.#${ref}`]);
    }
    return txSafe(r, reps);
  }

  // options.shadow で config のデフォルト shadow モードを受け取る（<meta> ブロックの指定が優先）
  const cn=tagToClass(c.meta.name||'x-component'),tn=c.meta.name||'x-component',sh=c.meta.shadow||(options&&options.shadow)||'open',us=sh!=='none',root=us?'this.#shadow':'this',fa=!!c.meta.form;

  // Reset eid counter for this component
  _eid = 0;
  eventBindings.length = 0;

  // Build template string first (populates eventBindings)
  const templateStr = tplStr(c.template, 6, null);

  // ─── Collect import declarations ───
  const imports = c.script.filter(d => d.kind === 'import');
  const hasImports = imports.length > 0;

  // Emit import statements BEFORE the IIFE (ES module top-level)
  let importBlock = '';
  if (hasImports) {
    for (const imp of imports) {
      // Type-only imports: emit only for TS target, skip for JS
      if (imp.typeOnly && !ts) continue;

      // Rewrite .ts/.tsx extensions to .js for browser compatibility
      let fromPath = imp.from;
      if (fromPath.endsWith('.ts')) fromPath = fromPath.slice(0, -3) + '.js';
      else if (fromPath.endsWith('.tsx')) fromPath = fromPath.slice(0, -4) + '.js';
      // Also rewrite .csk imports to .js
      if (fromPath.endsWith('.csk')) fromPath = fromPath.slice(0, -4) + '.js';

      const parts = [];
      if (imp.defaultImport) parts.push(imp.defaultImport);
      if (imp.namedImports) {
        const ns = imp.namedImports.find(n => n.startsWith('*:'));
        if (ns) {
          // Namespace import: import * as ns from "mod"
          parts.push(`* as ${ns.slice(2)}`);
        } else {
          const named = imp.namedImports.join(', ');
          if (imp.defaultImport) {
            // Already added default, just add named
            parts.push(`{ ${named} }`);
          } else {
            parts.push(`{ ${named} }`);
          }
        }
      }
      const typePrefix = imp.typeOnly ? 'type ' : '';
      if (parts.length === 0) {
        // Side-effect import: import './module.js'
        importBlock += `import '${fromPath}';\n`;
      } else {
        importBlock += `import ${typePrefix}${parts.join(', ')} from '${fromPath}';\n`;
      }
    }
    importBlock += '\n';
  }

  // Now generate the class wrapped in IIFE
  let o = `/* Built with Chasket v${__chasketVersion} — https://chasket.dev */\n`;
  o += importBlock;
  o += `(() => {\n"use strict";\n\n`;
  o += `class ${cn} extends HTMLElement {\n`;
  // adoptedStyleSheets for CSP-safe styling (both Shadow DOM and shadow: none)
  // Uses CSSStyleSheet constructor when available, falls back to <style> tag
  const hasStyle = !!c.style;
  const cssStr = hasStyle ? (us ? minCss(c.style) : minCss(scopeCss(c.style, tn))) : '';
  if (hasStyle) {
    // Escape for safe embedding in template literal AND HTML <style> context:
    // 1. Backslashes, backticks, ${} for template literal safety
    // 2. </style> and </script> to prevent HTML context breakout (XSS)
    const safeCss = cssStr
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${')
      .replace(/<\/(style|script)/gi, '<\\/$1');
    o += `  static #__css = \`${safeCss}\`;\n`;
    o += `  static #__sheet = (() => { try { const s = new CSSStyleSheet(); s.replaceSync(${cn}.#__css); return s; } catch(e) { return null; } })();\n`;
    if (!us) {
      // shadow: none: track how many instances are using the document-level sheet
      o += `  static #__sheetRefCount = 0;\n`;
    }
    o += `\n`;
  }
  // Form-associated custom element support
  if (fa) {
    o += `  static formAssociated = true;\n`;
    o += `  #internals${ts ? ': ElementInternals' : ''};\n\n`;
  }
  // State: backing field + getter/setter パターン
  // setter 内で #scheduleUpdate() を呼び出し、非同期コールバック内の state 変更でも
  // 自動的に DOM が更新されるようにする（microtask デバウンス）
  for(const d of c.script) {
    if(d.kind==='state') {
      o+=`  #_${d.name}${ts?': '+typeToTs(d.type):''} = ${d.init};\n`;
      o+=`  get #${d.name}()${ts?' : '+typeToTs(d.type):''} { return this.#_${d.name}; }\n`;
      o+=`  set #${d.name}(v${ts?': '+typeToTs(d.type):''}) { this.#_${d.name} = v; this.#scheduleUpdate(); }\n`;
    }
  }
  for(const d of c.script)if(d.kind==='const')o+=`  #${d.name}${ts?': '+typeToTs(d.type):''} = ${d.init};\n`;
  for(const d of c.script)if(d.kind==='let')o+=`  #${d.name}${ts?': '+typeToTs(d.type):''} = ${d.init};\n`;
  for(const d of c.script)if(d.kind==='provide')o+=`  #${d.name}${ts?': '+typeToTs(d.type):''} = ${d.init};\n`;
  for(const d of c.script)if(d.kind==='consume')o+=`  #${d.name}${ts?': '+typeToTs(d.type)+' | undefined':''} = undefined;\n`;
  for(const d of c.script)if(d.kind==='ref')o+=`  #${d.name}${ts?': '+typeToTs(d.type)+' | null':''} = null;\n`;
  // microtask デバウンス用フラグ
  o+=`  #updateScheduled${ts?' : boolean':''} = false;\n`;
  if(us)o+=`  #shadow${ts?': ShadowRoot':''};\n`;
  if(!us && hasStyle) o+=`  #__sheetAttached${ts?' : boolean':''} = false;\n`;
  o+=`  #listeners${ts?': [Element, string, EventListener][]':''} = [];\n\n`;
  if(pv.length){o+=`  static get observedAttributes() {\n    return [${pv.map(p=>`'${camelToKebab(p)}'`).join(', ')}];\n  }\n\n`;}
  o+=`  constructor() {\n    super();\n`;
  if(us) {
    o+=`    this.#shadow = this.attachShadow({ mode: '${sh}' });\n`;
    if (hasStyle) {
      o+=`    if (${cn}.#__sheet) this.#shadow.adoptedStyleSheets = [${cn}.#__sheet];\n`;
    }
  }
  if(fa)o+=`    this.#internals = this.attachInternals();\n`;
  o+=`  }\n\n`;
  // Error boundary: check if component has on error handler
  const hasErrorHandler = c.script.some(d => d.kind==='lifecycle' && d.event==='error');
  o+=`  connectedCallback() {\n`;
  if (hasErrorHandler) o+=`   try {\n`;
  // shadow: none mode: add scoping attribute for CSS isolation
  if (!us) {
    o+=`    this.setAttribute('data-chasket-scope', '${tn}');\n`;
    if (hasStyle) {
      // Adopt stylesheet into document (ref-counted, idempotent per instance)
      o+=`    if (${cn}.#__sheet && !this.#__sheetAttached) {\n`;
      o+=`      this.#__sheetAttached = true;\n`;
      o+=`      if (${cn}.#__sheetRefCount++ === 0) {\n`;
      o+=`        document.adoptedStyleSheets = [...document.adoptedStyleSheets, ${cn}.#__sheet];\n`;
      o+=`      }\n`;
      o+=`    }\n`;
    }
  }
  // Read initial prop values from HTML attributes
  for(const d of c.script) {
    if(d.kind==='prop') {
      const kebab=camelToKebab(d.name);
      // P2-32: Use typeName() to safely extract primitive name
      const tn = typeName(d.type);
      const coerce = tn==='number'?`parseFloat(v) || 0`:tn==='boolean'?`v !== null && v !== 'false'`:`v || ${d.default||"''"}`;
      o+=`    { const v = this.getAttribute('${kebab}'); if (v !== null) this.#prop_${d.name} = ${coerce}; }\n`;
    }
  }
  // provide: listen for context requests from descendants
  for(const d of c.script) {
    if(d.kind==='provide') {
      o+=`    this.addEventListener('__chasket_ctx_${d.name}', (e) => { e.stopPropagation(); e.detail.value = this.#${d.name}; e.detail.provider = this; });\n`;
      // Track consumers for reactive updates
      o+=`    if (!this.__chasket_ctx_subs_${d.name}) this.__chasket_ctx_subs_${d.name} = new Set();\n`;
      o+=`    this.addEventListener('__chasket_ctx_sub_${d.name}', (e) => { e.stopPropagation(); this.__chasket_ctx_subs_${d.name}.add(e.detail.consumer); });\n`;
      o+=`    this.addEventListener('__chasket_ctx_unsub_${d.name}', (e) => { e.stopPropagation(); this.__chasket_ctx_subs_${d.name}.delete(e.detail.consumer); });\n`;
    }
  }
  // consume: dispatch event to find nearest ancestor provider, subscribe for updates
  for(const d of c.script) {
    if(d.kind==='consume') {
      o+=`    { const detail = { value: undefined, provider: null };\n`;
      o+=`      this.dispatchEvent(new CustomEvent('__chasket_ctx_${d.name}', { detail, bubbles: true, composed: true }));\n`;
      o+=`      if (detail.provider) {\n`;
      o+=`        this.#${d.name} = detail.value;\n`;
      o+=`        this.__chasket_ctx_provider_${d.name} = detail.provider;\n`;
      o+=`        this.dispatchEvent(new CustomEvent('__chasket_ctx_sub_${d.name}', { detail: { consumer: this }, bubbles: true, composed: true }));\n`;
      o+=`      }\n`;
      o+=`    }\n`;
    }
  }
  o+=`    this.#render();\n    this.#bindEvents();\n    this.#bindRefs();\n`;
  for(const d of c.script)if(d.kind==='lifecycle'&&d.event==='mount')o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
  if (hasErrorHandler) {
    o+=`   } catch (__err) {\n`;
    o+=`    this.#handleError(__err);\n`;
    o+=`   }\n`;
  }
  o+=`  }\n\n`;
  o+=`  disconnectedCallback() {\n    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));\n    this.#listeners = [];\n`;
  // Unsubscribe consumed contexts
  for(const d of c.script) {
    if(d.kind==='consume') {
      o+=`    if (this.__chasket_ctx_provider_${d.name}) {\n`;
      o+=`      this.dispatchEvent(new CustomEvent('__chasket_ctx_unsub_${d.name}', { detail: { consumer: this }, bubbles: true, composed: true }));\n`;
      o+=`    }\n`;
    }
  }
  for(const d of c.script)if(d.kind==='lifecycle'&&d.event==='unmount')o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
  // shadow: none: remove adopted stylesheet from document when last instance disconnects (idempotent)
  if (!us && hasStyle) {
    o+=`    if (${cn}.#__sheet && this.#__sheetAttached) {\n`;
    o+=`      this.#__sheetAttached = false;\n`;
    o+=`      if (--${cn}.#__sheetRefCount === 0) {\n`;
    o+=`        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== ${cn}.#__sheet);\n`;
    o+=`      }\n`;
    o+=`    }\n`;
  }
  o+=`  }\n\n`;
  // Provide: notify consumers when value changes
  for(const d of c.script) {
    if(d.kind==='provide') {
      o+=`  #notifyCtx_${d.name}() {\n`;
      o+=`    if (this.__chasket_ctx_subs_${d.name}) {\n`;
      o+=`      for (const c of this.__chasket_ctx_subs_${d.name}) {\n`;
      o+=`        if (c.isConnected) { c.__chasket_ctx_receive_${d.name}?.(this.#${d.name}); }\n`;
      o+=`      }\n`;
      o+=`    }\n`;
      o+=`  }\n\n`;
    }
  }
  // Consume: receive callback for reactive updates
  for(const d of c.script) {
    if(d.kind==='consume') {
      o+=`  __chasket_ctx_receive_${d.name}(v) { this.#${d.name} = v; this.#scheduleUpdate(); }\n\n`;
    }
  }
  // adoptedCallback
  const adoptHooks = c.script.filter(d => d.kind==='lifecycle' && d.event==='adopt');
  if (adoptHooks.length > 0) {
    o+=`  adoptedCallback() {\n`;
    for(const d of adoptHooks) o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
    o+=`  }\n\n`;
  }

  // attributeChangedCallback
  if(pv.length) {
    o+=`  attributeChangedCallback(name, oldVal, newVal) {\n    if (oldVal === newVal) return;\n`;
    for(const d of c.script)if(d.kind==='prop'){
      const kebab=camelToKebab(d.name);
      // P2-32: Use typeName() to safely extract primitive name
      const tn = typeName(d.type);
      const coerce = tn==='number'?'parseFloat(newVal) || 0':tn==='boolean'?"newVal !== null && newVal !== 'false'":"newVal || ''";
      o+=`    if (name === '${kebab}') { this.#prop_${d.name} = ${coerce}; this.#scheduleUpdate(); }\n`;
    }
    o+=`  }\n\n`;
  }

  // Form-associated lifecycle callbacks
  if (fa) {
    o+=`  formAssociatedCallback(form${ts ? ': HTMLFormElement' : ''}) {\n`;
    for(const d of c.script) if(d.kind==='lifecycle'&&d.event==='formAssociated') o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
    o+=`  }\n\n`;
    o+=`  formDisabledCallback(disabled${ts ? ': boolean' : ''}) {\n`;
    for(const d of c.script) if(d.kind==='lifecycle'&&d.event==='formDisabled') o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
    o+=`  }\n\n`;
    o+=`  formResetCallback() {\n`;
    for(const d of c.script) if(d.kind==='lifecycle'&&d.event==='formReset') o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
    o+=`  }\n\n`;
    o+=`  formStateRestoreCallback(state${ts ? ': string' : ''}, mode${ts ? ': string' : ''}) {\n`;
    for(const d of c.script) if(d.kind==='lifecycle'&&d.event==='formStateRestore') o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
    o+=`  }\n\n`;
    // Public form API helpers
    o+=`  get form()${ts ? ': HTMLFormElement | null' : ''} { return this.#internals.form; }\n`;
    o+=`  get validity()${ts ? ': ValidityState' : ''} { return this.#internals.validity; }\n`;
    o+=`  get validationMessage()${ts ? ': string' : ''} { return this.#internals.validationMessage; }\n`;
    o+=`  get willValidate()${ts ? ': boolean' : ''} { return this.#internals.willValidate; }\n`;
    o+=`  checkValidity()${ts ? ': boolean' : ''} { return this.#internals.checkValidity(); }\n`;
    o+=`  reportValidity()${ts ? ': boolean' : ''} { return this.#internals.reportValidity(); }\n\n`;
    // Helper to set form value — exposed to script as setFormValue()
    o+=`  #setFormValue(value${ts ? ': string | File | FormData | null' : ''}, state${ts ? '?: string | File | FormData | null' : ''}) {\n`;
    o+=`    this.#internals.setFormValue(value, state);\n`;
    o+=`  }\n\n`;
    // Helper to set custom validity
    o+=`  #setValidity(flags${ts ? ': ValidityStateFlags' : ''}, message${ts ? '?: string' : ''}, anchor${ts ? '?: HTMLElement' : ''}) {\n`;
    o+=`    this.#internals.setValidity(flags, message, anchor);\n`;
    o+=`  }\n\n`;
  }

  // P2-32: Use typeName() to safely extract primitive name for default values
  for(const d of c.script)if(d.kind==='prop'){const tn=typeName(d.type);const def=d.default||(tn==='number'?'0':tn==='boolean'?'false':"''");const tsType=ts?': '+typeToTs(d.type):'';o+=`  #prop_${d.name}${tsType} = ${def};\n  get ${d.name}()${tsType} { return this.#prop_${d.name}; }\n\n`;}
  for(const d of c.script)if(d.kind==='computed'){const tsType=ts?': '+typeToTs(d.type):'';o+=`  get #${d.name}()${tsType} { return ${tx(d.expr)}; }\n\n`;}
  for(const d of c.script)if(d.kind==='emit'){const opts=d.options||{bubbles:true,composed:true};const detailType=ts?': '+typeToTs(d.type):'';o+=`  #emit_${d.name}(detail${detailType})${ts?': void':''} {\n    this.dispatchEvent(new CustomEvent('${d.name}', { detail, bubbles: ${opts.bubbles}, composed: ${opts.composed} }));\n  }\n\n`;}
  for(const d of c.script)if(d.kind==='fn'){const ak=d.async?'async ':'',ps=d.params.map(p=>ts?`${p.name}: ${typeToTs(p.type)}`:p.name).join(', ');const retType=ts&&d.returnType?': '+typeToTs(d.returnType):'';o+=`  ${ak}#${d.name}(${ps})${retType} {\n    ${txBody(d.body).split('\n').join('\n    ')}\n  }\n\n`;}
  for(const d of c.script)if(d.kind==='watch')o+=`  #watch_${d.deps.join('_')}() {\n    ${txBody(d.body).split('\n').join('\n    ')}\n  }\n\n`;
  // Generate helper methods from <meta> helpers declaration
  // e.g., helpers: ["window.__t as tr"] → #tr(...args) { return window.__t(...args); }
  if(c.meta.helpers && c.meta.helpers.length > 0){
    for(const h of c.meta.helpers){
      o+=`  #${h.name}(...args) { return ${h.source}(...args); }\n\n`;
    }
  }
  // Generate previous-value fields for watch dependencies
  const watchDecls = c.script.filter(d => d.kind === 'watch');
  if (watchDecls.length > 0) {
    const allWatchedDeps = new Set();
    for (const w of watchDecls) w.deps.forEach(d => allWatchedDeps.add(d));
    for (const dep of allWatchedDeps) {
      const stateDecl = c.script.find(d => d.kind === 'state' && d.name === dep);
      if (stateDecl) {
        o += `  #__prev_${dep} = ${stateDecl.init};\n`;
      }
    }
    o += '\n';
  }

  // #render - initial render (full replace) and template generation
  o+=`  #render() {\n`;
  o+=`    const tpl = document.createElement('template');\n`;
  o+=`    tpl.innerHTML = \`\n`;
  if(hasStyle) {
    if (us) {
      // Shadow DOM: use <style> only as fallback when adoptedStyleSheets is unavailable
      o+=`      \${${cn}.#__sheet ? '' : '<style>' + ${cn}.#__css + '</style>'}\n`;
    } else {
      // shadow: none: use <style> only as fallback when adoptedStyleSheets is unavailable
      o+=`      \${${cn}.#__sheet ? '' : '<style>' + ${cn}.#__css + '</style>'}\n`;
    }
  }
  o+=templateStr;
  o+=`    \`;\n`;
  o+=`    ${root}.replaceChildren(tpl.content.cloneNode(true));\n`;
  o+=`  }\n\n`;

  // #getNewTree - generate new DOM tree from current state (for diffing)
  o+=`  #getNewTree() {\n`;
  o+=`    const tpl = document.createElement('template');\n`;
  o+=`    tpl.innerHTML = \`\n`;
  if(hasStyle) {
    if (us) {
      o+=`      \${${cn}.#__sheet ? '' : '<style>' + ${cn}.#__css + '</style>'}\n`;
    } else {
      // shadow: none: use <style> only as fallback when adoptedStyleSheets is unavailable
      o+=`      \${${cn}.#__sheet ? '' : '<style>' + ${cn}.#__css + '</style>'}\n`;
    }
  }
  o+=templateStr;
  o+=`    \`;\n`;
  o+=`    return tpl.content;\n`;
  o+=`  }\n\n`;

  // #patch - diff-based DOM patching (morphdom-lite)
  o+=`  #patch(parent, newContent) {\n`;
  o+=`    const newNodes = Array.from(newContent.childNodes);\n`;
  o+=`    const oldNodes = Array.from(parent.childNodes);\n`;
  o+=`    const max = Math.max(oldNodes.length, newNodes.length);\n`;
  o+=`    for (let i = 0; i < max; i++) {\n`;
  o+=`      const o = oldNodes[i], n = newNodes[i];\n`;
  o+=`      if (!n) { parent.removeChild(o); continue; }\n`;
  o+=`      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }\n`;
  o+=`      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {\n`;
  o+=`        parent.replaceChild(n.cloneNode(true), o); continue;\n`;
  o+=`      }\n`;
  o+=`      if (o.nodeType === 3) {\n`;
  o+=`        if (o.textContent !== n.textContent) o.textContent = n.textContent;\n`;
  o+=`        continue;\n`;
  o+=`      }\n`;
  o+=`      if (o.nodeType === 1) {\n`;
  // Patch attributes
  o+=`        const oA = o.attributes, nA = n.attributes;\n`;
  o+=`        for (let j = nA.length - 1; j >= 0; j--) {\n`;
  o+=`          const a = nA[j];\n`;
  o+=`          if (a.name === 'value' && (o.tagName === 'INPUT' || o.tagName === 'TEXTAREA' || o.tagName === 'SELECT')) {\n`;
  o+=`            if (o.value !== a.value) o.value = a.value;\n`;
  o+=`          } else if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);\n`;
  o+=`        }\n`;
  o+=`        for (let j = oA.length - 1; j >= 0; j--) {\n`;
  o+=`          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);\n`;
  o+=`        }\n`;
  // Skip <style> children (no need to diff CSS)
  o+=`        if (o.tagName === 'STYLE') {\n`;
  o+=`          if (o.textContent !== n.textContent) o.textContent = n.textContent;\n`;
  o+=`          continue;\n`;
  o+=`        }\n`;
  // Custom elements (tag names with '-') manage their own DOM.
  // Update their attributes (for prop passing) but do NOT recurse into children,
  // which would destroy their rendered Shadow DOM content.
  o+=`        if (o.tagName.includes('-')) {\n`;
  o+=`          for (let j = nA.length - 1; j >= 0; j--) {\n`;
  o+=`            const a = nA[j];\n`;
  o+=`            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);\n`;
  o+=`          }\n`;
  o+=`          for (let j = oA.length - 1; j >= 0; j--) {\n`;
  o+=`            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);\n`;
  o+=`          }\n`;
  o+=`          continue;\n`;
  o+=`        }\n`;
  // Recurse into children
  o+=`        this.#patch(o, n);\n`;
  o+=`      }\n`;
  o+=`    }\n`;
  o+=`  }\n\n`;

  // #bindEvents - using data-chasket-id
  o+=`  #bindEvents() {\n`;
  o+=buildEvtCode(root);
  o+=`  }\n\n`;

  // #bindRefs - bind ref declarations to DOM elements via data-ref
  o+=`  #bindRefs() {\n`;
  for(const d of c.script) {
    if(d.kind==='ref') {
      o+=`    this.#${d.name} = ${root}.querySelector('[data-ref="${d.name}"]');\n`;
    }
  }
  o+=`  }\n\n`;

  // #scheduleUpdate - microtask デバウンスで #update() をスケジュール
  // state の setter から呼ばれ、同一 microtask 内の複数の state 変更を1回の update にまとめる
  // setTimeout, Promise, fetch コールバック等の非同期コンテキストからも自動更新される
  o+=`  #scheduleUpdate() {\n`;
  o+=`    if (this.#updateScheduled) return;\n`;
  o+=`    this.#updateScheduled = true;\n`;
  o+=`    queueMicrotask(() => {\n`;
  o+=`      this.#updateScheduled = false;\n`;
  o+=`      this.#update();\n`;
  o+=`    });\n`;
  o+=`  }\n\n`;

  // #update - diff-based re-render (preserves DOM state)
  if(optimize){usedHelpers.add('patch');usedHelpers.add('getNewTree');}o+=`  #update() {\n`;
  // 保留中の microtask をキャンセル（イベントハンドラから同期的に呼ばれた場合の二重更新を防止）
  o+=`    this.#updateScheduled = false;\n`;
  if (hasErrorHandler) o+=`   try {\n`;
  o+=`    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));\n`;
  o+=`    this.#listeners = [];\n`;
  // S-09: Sanitize watch dep names for valid JS identifiers (e.g., "obj.x" → "obj_x")
  function safeDepKey(deps) { return deps.map(d => d.replace(/[^a-zA-Z0-9_]/g, '_')).join('_'); }
  // Check watch deps before re-render
  for(const d of c.script) {
    if (d.kind==='watch') {
      const depChecks = d.deps.map(dep => `this.#${dep.replace(/[^a-zA-Z0-9_]/g, '_')} !== this.#__prev_${dep.replace(/[^a-zA-Z0-9_]/g, '_')}`).join(' || ');
      o+=`    const __watchFire_${safeDepKey(d.deps)} = ${depChecks};\n`;
    }
  }
  o+=`    this.#patch(${root}, this.#getNewTree());\n`;
  o+=`    this.#bindEvents();\n`;
  o+=`    this.#bindRefs();\n`;
  for(const d of c.script) {
    if (d.kind==='watch') {
      const depsKey = safeDepKey(d.deps);
      o+=`    if (__watchFire_${depsKey}) {\n`;
      o+=`      this.#watch_${depsKey}();\n`;
      for (const dep of d.deps) {
        o+=`      this.#__prev_${dep.replace(/[^a-zA-Z0-9_]/g, '_')} = this.#${dep.replace(/[^a-zA-Z0-9_]/g, '_')};\n`;
      }
      o+=`    }\n`;
    }
  }
  // Notify context consumers after update
  for(const d of c.script) {
    if(d.kind==='provide') {
      o+=`    this.#notifyCtx_${d.name}();\n`;
    }
  }
  if (hasErrorHandler) {
    o+=`   } catch (__err) {\n`;
    o+=`    this.#handleError(__err);\n`;
    o+=`   }\n`;
  }
  o+=`  }\n\n`;

  // #updateKeepFocus - with diff-based patching, focus is preserved naturally
  // since #patch() modifies existing DOM nodes in-place rather than replacing them.
  o+=`  #updateKeepFocus(focusedEl) {\n`;
  o+=`    this.#update();\n`;
  o+=`  }\n\n`;

  // #handleError - error boundary handler
  if (hasErrorHandler) {
    o+=`  #handleError(__err) {\n`;
    o+=`    console.error('[${tn}] Component error:', __err);\n`;
    // Execute user's on error handler
    for(const d of c.script) {
      if(d.kind==='lifecycle'&&d.event==='error') {
        o+=`    const error = __err;\n`;
        o+=`    ${txBody(d.body).split('\n').join('\n    ')}\n`;
      }
    }
    // Render a fallback error UI if the component has shadow DOM
    o+=`    try {\n`;
    o+=`      ${root}.innerHTML = '<div style="padding:1rem;border:1px solid #ef4444;border-radius:6px;background:#fef2f2;color:#991b1b;font-family:sans-serif">' +\n`;
    o+=`        '<strong style="display:block;margin-bottom:0.5rem">Component Error</strong>' +\n`;
    o+=`        '<code style="font-size:0.85em">' + this.#esc(String(__err.message || __err)) + '</code></div>';\n`;
    o+=`    } catch (e) { /* fallback rendering failed */ }\n`;
    o+=`  }\n\n`;
  }

  // #esc - HTML text content escaping (prevents XSS in {{ }} interpolation)
  if (!optimize || usedHelpers.has('esc')) {
    o+=`  #esc(val) {\n`;
    o+=`    if (val == null) return '';\n`;
    o+=`    const s = String(val);\n`;
    o+=`    if (!/[&<>"']/.test(s)) return s;\n`;
    o+=`    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');\n`;
    o+=`  }\n\n`;
  }

  // #escAttr - Attribute value escaping (prevents attribute injection)
  if (!optimize || usedHelpers.has('escAttr')) {
    o+=`  #escAttr(val) {\n`;
    o+=`    if (val == null) return '';\n`;
    o+=`    const s = String(val);\n`;
    o+=`    if (!/[&<>"'`+'`\\n\\r]/.test(s)) return s;\n';
    o+=`    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\`/g,'&#96;').replace(/\\n/g,'&#10;').replace(/\\r/g,'&#13;');\n`;
    o+=`  }\n\n`;
  }

  // #escUrl - URL sanitization (blocks javascript:, data:, vbscript:, blob:, file: URLs)
  // S-04: Iterative decoding to prevent multi-level encoding bypass (e.g., java%2573cript:)
  if (!optimize || usedHelpers.has('escUrl')) {
    o+=`  #escUrl(val) {\n`;
    o+=`    if (val == null) return '';\n`;
    o+=`    const s = String(val).trim();\n`;
    o+=`    let decoded = s;\n`;
    o+=`    for (let i = 0; i < 5; i++) {\n`;
    o+=`      try {\n`;
    o+=`        const next = decodeURIComponent(decoded);\n`;
    o+=`        if (next === decoded) break;\n`;
    o+=`        decoded = next;\n`;
    o+=`      } catch(e) { break; }\n`;
    o+=`    }\n`;
    o+=`    const normalized = decoded.replace(/[\\s\\x00-\\x1F]/g, '');\n`;
    o+=`    if (/(javascript|data|vbscript|blob|file)\\s*:/i.test(normalized)) return 'about:blank';\n`;
    o+=`    return this.#escAttr(normalized);\n`;
    o+=`  }\n`;
  }

  o+=`}\n\n`;
  // Deferred registration: if __chasketDefineQueue exists (bundle mode), push to queue.
  // Otherwise register immediately (standalone mode).
  // HMR support: store latest class in global registry for hot-swapping.
  o+=`if (typeof __chasketClasses !== 'undefined') {\n`;
  o+=`  __chasketClasses['${tn}'] = ${cn};\n`;
  o+=`}\n`;
  o+=`if (typeof __chasketDefineQueue !== 'undefined') {\n`;
  o+=`  __chasketDefineQueue.push(['${tn}', ${cn}]);\n`;
  o+=`} else if (!customElements.get('${tn}')) {\n`;
  o+=`  customElements.define('${tn}', ${cn});\n`;
  o+=`}\n`;

  // Close IIFE
  o += `\n})();\n`;

  // P1-19: For TypeScript or ES module mode, add export after IIFE
  if(ts) {
    o+=`\nexport default ${cn};\nexport {};\n`;
  }

  return { output: o, usedHelpers };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Main compiler entry point.
 *
 * Orchestrates the 5-phase compilation pipeline:
 * 1. Split: Extract blocks
 * 2. Parse: Parse meta, script, template, style
 * 3. Check: Type checking and diagnostics
 * 4. Generate: Code generation
 * 5. Output: Return compiled code or .d.ts
 *
 * @param {string} source - Raw .csk file content
 * @param {string} fileName - Source file name (for default component name)
 * @param {Object} [options] - Compiler options {target: 'ts'|'js', optimize: boolean}
 * @returns {Object} Compilation result:
 *   - success: boolean
 *   - output: Generated JavaScript code (if successful)
 *   - dtsOutput: Generated TypeScript .d.ts (if target='ts')
 *   - diagnostics: Array of error/warning diagnostics
 *   - ast: Component AST (useful for analysis)
 *   - usedHelpers: Set of helper methods actually used (if optimize=true)
 *
 * @example
 * const result = compile(sourceCode, 'my-button.csk', {target: 'ts'});
 * if (result.success) {
 *   fs.writeFileSync('my-button.js', result.output);
 *   fs.writeFileSync('my-button.d.ts', result.dtsOutput);
 * } else {
 *   result.diagnostics.forEach(d => console.error(d.message));
 * }
 *
 * @description
 * このコンパイラは .csk ファイルを Web Components に変換します。
 * エラーが発生した場合は success=false が返され、diagnostics に詳細が含まれます。
 */
function compile(source, fileName, options) {
  // Phase 1: Split blocks
  const blocks = splitBlocks(source);
  if (!blocks.some(b => b.type === 'template'))
    return {
      success:false,
      diagnostics:[{
        level:'error',
        code:'E0001',
        message:msg('E0001')
      }]
    };

  // Phase 2: Parse
  let meta={}, script=[], template=[], style='';
  for(const b of blocks){
    switch(b.type){
      case'meta': meta=parseMeta(b.content); break;
      case'script': script=parseScript(b.content,b.startLine); break;
      case'template': template=parseTemplateNodes(b.content.trim()); break;
      case'style': style=b.content.trim(); break;
    }
  }

  // helpers バリデーションエラーを一時保存（diagnostics は後続で生成）
  const helperErrors = meta._helperErrors || [];
  delete meta._helperErrors;

  // Auto-generate component name from filename if not specified
  if(!meta.name) {
    const base = fileName.replace(/\.csk$/,'').replace(/([A-Z])/g,'-$1').toLowerCase().replace(/^-/,'');
    // ファイル名にハイフンが含まれていればそのまま使用、なければ x- を付与
    meta.name = base.includes('-') ? base : 'x-' + base;
  }

  // S-05: Validate component name per Web Component spec
  // Must contain a hyphen, start with lowercase letter, no uppercase
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(meta.name)) {
    return {
      success: false,
      diagnostics: [{
        level: 'error',
        code: 'E0003',
        message: msg('E0003', { name: meta.name })
      }]
    };
  }

  // ─── Auto-import: resolve child components used in template ───
  if (options?.componentRegistry) {
    const usedTags = collectCustomElements(template);
    const ownTag = meta.name;
    const deps = resolveComponents(usedTags, options.componentRegistry);
    for (const dep of deps) {
      if (dep.tag === ownTag) continue; // Don't self-import
      // Check if user already imported this path
      const alreadyImported = script.some(d => d.kind === 'import' && d.from === dep.path);
      if (!alreadyImported) {
        script.unshift({
          kind: 'import',
          defaultImport: undefined,
          namedImports: undefined,
          from: dep.path,
          span: { line: 0 },
          _auto: true  // Mark as auto-generated
        });
      }
    }
  }

  // Build AST
  const ast={meta,script,template,style,fileName};

  // S-10: Collect parser error nodes from template AST and report as diagnostics
  const parseErrors = [];
  (function collectErrors(nodes) {
    for (const n of nodes) {
      if (n.kind === 'text' && typeof n.value === 'string' && n.value.startsWith('Error: ')) {
        parseErrors.push({ level: 'error', code: 'E0004', message: msg('E0004', { error: n.value.substring(7) }) });
      }
      if (n.children) collectErrors(n.children);
      if (n.elseChildren) collectErrors(n.elseChildren);
      if (n.emptyChildren) collectErrors(n.emptyChildren);
      if (n.elseIfChain) for (const b of n.elseIfChain) { if (b.children) collectErrors(b.children); }
    }
  })(template);

  // Phase 3: Type check
  const checker=new TypeChecker(ast);
  const diagnostics=checker.check();
  diagnostics.push(...parseErrors);
  // SEC-06: Collect _diagnostic entries from script parser (e.g., unrecognized imports)
  for (const d of script) {
    if (d.kind === '_diagnostic') {
      diagnostics.push({ level: d.level, code: d.code, message: d.message, span: d.span });
    }
  }
  // helpers バリデーションエラーを追加
  for (const msg of helperErrors) {
    diagnostics.push({ level:'error', code:'E0501', message:msg });
  }

  // Warn if unsupported features are used
  if(meta.extends) {
    diagnostics.push({
      level:'warning',
      code:'W0205',
      message:'extends はまだサポートされていません'
    });
  }

  // Fail on any error
  if(diagnostics.some(d=>d.level==='error')) {
    return{success:false,diagnostics,ast};
  }

  // Phase 4: Code generation
  const generateResult=generate(ast, options);
  const output = typeof generateResult === 'string' ? generateResult : generateResult.output;
  const usedHelpers = typeof generateResult === 'string' ? null : generateResult.usedHelpers;

  // Phase 5: Generate source map
  // Create mappings from generated code back to original .csk file
  // For now, we use a simple mapping: script block maps 1:1, template/style map to their lines
  const mappings = [];
  let generatedLine = 0;

  // Script block mappings: map each line of generated script to original script line
  for (const scriptDecl of ast.script) {
    if (scriptDecl.line !== undefined) {
      mappings.push({
        generated: generatedLine,
        original: scriptDecl.line - 1,  // Convert to 0-indexed
        source: 0,
        column: 0
      });
    }
    generatedLine++;
  }

  // Add a mapping for the class declaration (roughly maps to template block start)
  const templateBlock = ast.template ? 40 : 0; // Estimate based on typical output structure
  if (templateBlock > 0) {
    for (let i = 0; i < templateBlock; i++) {
      if (mappings.length === 0 || mappings[mappings.length - 1].generated < i) {
        mappings.push({
          generated: i,
          original: 0,
          source: 0,
          column: 0
        });
      }
    }
  }

  // Generate source map object
  const sourceMapFileName = fileName || 'component.csk';
  const sourceMap = generateSourceMap(mappings, sourceMapFileName);

  // Append source map comment to output
  const mapFileName = sourceMapFileName.replace(/\.csk$/, '.js.map');
  const outputWithMap = appendSourceMapComment(output, mapFileName);

  // Phase 6: Optional .d.ts generation
  const dtsOutput=options?.target==='ts'?generateDts(ast):undefined;

  return{
    success:true,
    output: outputWithMap,
    sourceMap,
    dtsOutput,
    diagnostics,
    ast,
    usedHelpers: usedHelpers || new Set()
  };
}

// ============================================================
// SSR (Server-Side Rendering) Support
// ============================================================

/**
 * Render a Chasket component to static HTML string for SSR.
 *
 * Uses Declarative Shadow DOM (`<template shadowrootmode>`) for hydration.
 * Initial state is evaluated and embedded in the HTML output.
 *
 * @param {string} source - Raw .csk file content
 * @param {string} [fileName] - File name for diagnostics
 * @param {Object} [props] - Initial prop values to override defaults
 * @returns {{ html: string, css: string, tagName: string, success: boolean, diagnostics: Array }}
 *
 * @example
 * const { renderToString } = require('@chasket/chasket');
 * const { html } = renderToString(fs.readFileSync('Card.csk', 'utf-8'), 'Card.csk', { title: 'Hello' });
 * // Returns: <x-card><template shadowrootmode="open"><style>...</style><div>Hello</div></template></x-card>
 */
function renderToString(source, fileName, props = {}, options = {}) {
  // Phase 1-3: Parse and type-check (reuse compile pipeline)
  const blocks = splitBlocks(source);
  const diagnostics = [];
  let meta = {}, script = [], template = [], style = '';

  for (const b of blocks) {
    switch (b.type) {
      case 'meta': meta = parseMeta(b.content); break;
      case 'script': script = parseScript(b.content, b.startLine, diagnostics); break;
      case 'template': template = parseTemplateNodes(b.content); break;
      case 'style': style = b.content.trim(); break;
    }
  }

  // helpers バリデーションエラーを診断に追加
  if (meta._helperErrors) {
    for (const msg of meta._helperErrors) {
      diagnostics.push({ level:'error', code:'E0501', message:msg });
    }
    delete meta._helperErrors;
  }

  const tagName = meta.name || 'x-component';
  const useShadow = (meta.shadow || (options && options.shadow) || 'open') !== 'none';

  // Build initial values from state declarations and prop overrides
  const values = {};
  for (const d of script) {
    if (d.kind === 'state') {
      try {
        // Evaluate simple literals safely
        values[d.name] = evalSafeInit(d.init);
      } catch {
        values[d.name] = d.init; // Keep as string if can't evaluate
      }
    }
    if (d.kind === 'prop') {
      const propVal = props[d.name];
      if (propVal !== undefined) {
        values[d.name] = propVal;
      } else if (d.default) {
        try {
          values[d.name] = evalSafeInit(d.default);
        } catch {
          values[d.name] = d.default;
        }
      }
    }
    if (d.kind === 'computed') {
      // Computed values need expression evaluation — store expr for later
      values[`__computed_${d.name}`] = d.expr;
    }
  }

  // Render template nodes to HTML string
  function renderNodes(nodes) {
    let html = '';
    for (const node of nodes) {
      if (node.kind === 'text') {
        html += escHtml(node.value);
      } else if (node.kind === 'interpolation') {
        // Try to resolve the expression from known values
        const resolved = resolveExpr(node.expr, values);
        html += escHtml(String(resolved));
      } else if (node.kind === 'rawInterpolation') {
        // Raw interpolation — no escaping (user responsibility)
        const resolved = resolveExpr(node.expr, values);
        html += String(resolved);
      } else if (node.kind === 'element') {
        // Skip directives for SSR — render static content
        html += `<${node.tag}`;
        for (const attr of (node.attrs || [])) {
          if (attr.event) continue; // Skip event handlers
          if (attr.dynamic) {
            // Try to resolve dynamic attributes
            const val = resolveExpr(attr.value, values);
            if (attr.name === 'class' && typeof val === 'object' && val !== null) {
              if (Array.isArray(val)) {
                html += ` class="${escHtml(val.filter(Boolean).join(' '))}"`;
              } else {
                const cls = Object.entries(val).filter(([, b]) => b).map(([k]) => k).join(' ');
                html += ` class="${escHtml(cls)}"`;
              }
            } else if (val != null && val !== false) {
              html += ` ${attr.name}="${escHtml(String(val))}"`;
            }
          } else if (attr.name !== 'data-chasket-id') {
            html += ` ${attr.name}="${escHtml(attr.value)}"`;
          }
        }
        if (node.selfClosing) {
          html += ' />';
        } else {
          html += '>';
          if (node.children) html += renderNodes(node.children);
          html += `</${node.tag}>`;
        }
      } else if (node.kind === 'if') {
        // For SSR, evaluate condition and render matching branch
        const cond = resolveExpr(node.condition, values);
        if (cond) {
          html += renderNodes(node.children || []);
        } else if (node.elseIf) {
          for (const branch of node.elseIf) {
            if (branch.condition) {
              const branchCond = resolveExpr(branch.condition, values);
              if (branchCond) {
                html += renderNodes(branch.children || []);
                break;
              }
            } else {
              // :else branch
              html += renderNodes(branch.children || []);
              break;
            }
          }
        }
      } else if (node.kind === 'for') {
        // For SSR, try to evaluate the array and render items
        const arr = resolveExpr(node.of, values);
        if (Array.isArray(arr)) {
          for (let i = 0; i < arr.length; i++) {
            const itemValues = { ...values, [node.each]: arr[i] };
            if (node.index) itemValues[node.index] = i;
            html += renderNodesWithContext(node.children || [], itemValues);
          }
          if (arr.length === 0 && node.empty) {
            html += renderNodes(node.empty);
          }
        }
      }
    }
    return html;
  }

  function renderNodesWithContext(nodes, ctx) {
    const oldValues = { ...values };
    Object.assign(values, ctx);
    const html = renderNodes(nodes);
    // Restore original values
    for (const key of Object.keys(ctx)) {
      if (key in oldValues) {
        values[key] = oldValues[key];
      } else {
        delete values[key];
      }
    }
    return html;
  }

  // Safely evaluate simple JavaScript literals
  function evalSafeInit(expr) {
    // Only allow safe literals: strings, numbers, booleans, null, arrays, objects
    const trimmed = expr.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;
    if (trimmed === '""' || trimmed === "''") return '';
    if (trimmed === '[]') return [];
    if (trimmed === '{}') return {};
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1);
    // Try JSON parse for arrays and objects
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
    return trimmed;
  }

  // Resolve an expression against known values
  function resolveExpr(expr, ctx) {
    if (!expr) return '';
    const trimmed = expr.trim();
    // Direct variable reference
    if (ctx[trimmed] !== undefined) return ctx[trimmed];
    // Computed value
    if (ctx[`__computed_${trimmed}`]) {
      return resolveExpr(ctx[`__computed_${trimmed}`], ctx);
    }
    // Simple property access: obj.prop
    const dotMatch = trimmed.match(/^(\w+)\.(\w+)$/);
    if (dotMatch && ctx[dotMatch[1]] && typeof ctx[dotMatch[1]] === 'object') {
      return ctx[dotMatch[1]][dotMatch[2]];
    }
    // Ternary: cond ? a : b
    const ternaryMatch = trimmed.match(/^(\w+)\s*\?\s*(.+)\s*:\s*(.+)$/);
    if (ternaryMatch) {
      const cond = resolveExpr(ternaryMatch[1], ctx);
      return cond ? resolveExpr(ternaryMatch[2].trim(), ctx) : resolveExpr(ternaryMatch[3].trim(), ctx);
    }
    // Template literal: `text ${expr}`
    if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
      return trimmed.slice(1, -1).replace(/\$\{([^}]+)\}/g, (_, e) => {
        const val = resolveExpr(e.trim(), ctx);
        return val != null ? String(val) : '';
      });
    }
    // String concatenation or other complex expressions — return as-is
    return trimmed;
  }

  // Escape HTML entities
  function escHtml(s) {
    if (typeof s !== 'string') return String(s ?? '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Render the template
  const templateHtml = renderNodes(template);

  // Minify CSS
  const minifiedCss = style ? style.replace(/\s+/g, ' ').replace(/\s*{\s*/g, '{').replace(/\s*}\s*/g, '}').replace(/\s*:\s*/g, ':').replace(/\s*;\s*/g, ';').trim() : '';

  // Build final HTML
  let html = `<${tagName}`;
  // Add prop attributes
  for (const d of script) {
    if (d.kind === 'prop' && props[d.name] !== undefined) {
      const kebab = d.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      html += ` ${kebab}="${escHtml(String(props[d.name]))}"`;
    }
  }
  html += '>';

  if (useShadow) {
    html += `<template shadowrootmode="${meta.shadow || 'open'}">`;
    if (minifiedCss) html += `<style>${minifiedCss.replace(/<\/(style|script)/gi, '<\\/$1')}</style>`;
    html += templateHtml;
    html += '</template>';
  } else {
    // shadow: none — inline content directly
    html += templateHtml;
  }

  html += `</${tagName}>`;

  return {
    html,
    css: minifiedCss,
    tagName,
    success: diagnostics.every(d => d.level !== 'error'),
    diagnostics,
  };
}

// ============================================================
// Source Map Support (VLQ encoding and generation)
// ============================================================

/**
 * Encode a single number in VLQ (Variable-Length Quantity) format.
 * Used in Source Map V3 mappings string.
 *
 * VLQ encodes a number as a sequence of base-64 digits. The algorithm:
 * 1. Convert negative numbers: -x becomes (x << 1) | 1, positive x becomes x << 1
 * 2. Split into 5-bit chunks, MSB = continuation flag
 * 3. Convert each chunk to base64 character
 *
 * @param {number} n - Number to encode
 * @returns {string} VLQ-encoded string
 * @description
 * Base64 alphabet for VLQ: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/
 */
function vlqEncode(n) {
  const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let vlq = '';
  // Convert to VLQ: sign bit, then magnitude
  let value = n < 0 ? ((-n) << 1) | 1 : n << 1;
  do {
    let digit = value & 0x1f;  // Extract 5 bits
    value >>>= 5;              // Shift right 5 bits
    if (value > 0) digit |= 0x20;  // Set continuation bit if more digits follow
    vlq += base64[digit];
  } while (value > 0);
  return vlq;
}

/**
 * Generate Source Map V3 JSON from line mappings.
 *
 * Mappings is an array of line objects: [
 *   { generated, original, source, name },
 *   ...
 * ]
 *
 * Where:
 * - generated: line number in generated code (0-indexed)
 * - original: line number in original .csk file (0-indexed)
 * - source: index into sources array (usually 0)
 * - name: optional, index into names array
 *
 * Returns a Source Map V3 object with encoded mappings string.
 *
 * @param {Array<Object>} mappings - Array of line mapping objects
 * @param {string} fileName - Original source file name
 * @returns {Object} Source Map V3 object
 */
function generateSourceMap(mappings, fileName) {
  // Source Map V3 format requires mappings to be encoded as a single string
  // with semicolons separating lines and commas separating entries within a line

  let mappingsStr = '';
  let lastGeneratedCol = 0;
  let lastOriginalLine = 0;
  let lastOriginalCol = 0;
  let lastSourceIdx = 0;
  let lastNameIdx = 0;

  for (let i = 0; i < mappings.length; i++) {
    if (i > 0 && mappings[i].generated !== mappings[i-1].generated) {
      // New line
      mappingsStr += ';';
      lastGeneratedCol = 0;
    } else if (i > 0) {
      // Same line, new mapping
      mappingsStr += ',';
    }

    const m = mappings[i];
    // [generatedColumn, sourceIdx, originalLine, originalColumn, nameIdx]
    const fields = [
      m.generated - lastGeneratedCol,
      m.source - lastSourceIdx,
      m.original - lastOriginalLine,
      m.column - lastOriginalCol
    ];
    // Only add nameIdx if present
    if (m.name !== undefined) {
      fields.push(m.name - lastNameIdx);
    }

    // Encode each field as VLQ
    mappingsStr += fields.map(f => vlqEncode(f)).join('');

    // Update state for relative encoding
    lastGeneratedCol = m.generated;
    lastSourceIdx = m.source;
    lastOriginalLine = m.original;
    lastOriginalCol = m.column;
    if (m.name !== undefined) lastNameIdx = m.name;
  }

  return {
    version: 3,
    sources: [fileName],
    names: [],
    mappings: mappingsStr
  };
}

/**
 * Append source map comment to generated code.
 *
 * @param {string} code - Generated JavaScript code
 * @param {string} mapFileName - Name of the .map file (e.g., "component.js.map")
 * @returns {string} Code with sourceMappingURL comment appended
 */
function appendSourceMapComment(code, mapFileName) {
  return code + '\n//# sourceMappingURL=' + mapFileName;
}

// ============================================================
// Module Exports
// ============================================================

/**
 * Collect all custom element tag names used in template AST.
 *
 * Walks the template recursively and extracts any tag containing a hyphen,
 * which indicates a custom element (Web Component).
 *
 * @param {Array} nodes - Template AST nodes
 * @returns {Set<string>} Set of custom element tag names
 */
function collectCustomElements(nodes) {
  const tags = new Set();
  (function walk(nodes) {
    for (const n of nodes) {
      if (n.kind === 'element' && n.tag && n.tag.includes('-')) {
        tags.add(n.tag);
      }
      if (n.children) walk(n.children);
      if (n.elseChildren) walk(n.elseChildren);
      if (n.emptyChildren) walk(n.emptyChildren);
      if (n.elseIfChain) for (const b of n.elseIfChain) { if (b.children) walk(b.children); }
    }
  })(nodes);
  return tags;
}

/**
 * Resolve component dependencies from template usage.
 *
 * Maps custom element tag names to their .csk source files based on
 * a provided component registry (tag -> file path mapping).
 *
 * @param {Set<string>} usedTags - Custom element tags used in template
 * @param {Object} registry - Map of tag name -> file path (e.g., {'my-btn': './my-btn.csk'})
 * @returns {Array<{tag: string, path: string}>} Resolved component dependencies
 */
function resolveComponents(usedTags, registry) {
  const deps = [];
  for (const tag of usedTags) {
    if (registry && registry[tag]) {
      deps.push({ tag, path: registry[tag] });
    }
  }
  return deps;
}

module.exports = {
  compile,              // Main API entry point
  splitBlocks,          // For testing/debugging
  parseTemplateNodes,   // For testing template parsing
  TypeChecker,          // For testing type checking
  generate,             // For testing code generation
  collectCustomElements, // For resolving component dependencies
  resolveComponents,    // For auto-import resolution
  renderToString        // SSR: render component to static HTML
};
