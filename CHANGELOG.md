# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.3.1] - 2026-04-03

### CLI

- **Interactive `chasket init`**: Arrow-key template selection with 3 built-in templates (minimal counter, todo app, SPA)
- **`create-chasket` package**: Enables `npm create chasket` / `npm init chasket` for zero-config project scaffolding
- **i18n support**: CLI messages in English and Japanese (auto-detected from `CHASKET_LANG` or `LANG` environment variable)
- **Template improvements**: All generated projects use `chasket dev` / `chasket build` in npm scripts (no `npx` needed)
- **Non-TTY fallback**: Interactive prompts gracefully fall back to number-based input in piped environments

### VS Code Extension (v0.2.2)

- **Export validation fix**: Feature 3 now checks ALL matching files (.d.ts, .ts, .js) instead of stopping at the first match — fixes false warnings when `.d.ts` exists but doesn't contain a named export that `.ts` does
- **Go-to-definition fix**: Named import jump now correctly finds exports with `declare`, `async`, `abstract class`, `export { name }` patterns
- **Published to VS Code Marketplace**: Available as `chasket.chasket-lang`

---

## [0.3.0] - 2026-03-31

### Core

- **ES Module output**: When `.csk` files contain `import` statements, the compiler outputs ES Module format instead of IIFE wrapper
- **TypeScript import support**: Components can `import` from external `.ts` / `.js` files
- **TypeScript transpilation**: `src/lib/*.ts` files are automatically type-stripped and output to `dist/lib/`
- **Dev server TS support**: `.ts` files served as `.js` on the fly during development

### CLI

- `chasket build` now transpiles TypeScript files in `src/lib/` to `dist/lib/`
- `chasket dev` serves `.ts` imports as `.js` with automatic transpilation
- Bundle output uses `type="module"` when ES Module imports are detected

### VS Code Extension (v0.2.1)

- **Feature 3**: Import path validation — warns on unresolved paths and missing named exports
- **Go to Definition**: Jump to `.ts` / `.js` source files from `import` statements in `.csk` files
- Auto-completion for import paths

---

## [0.2.0] - 2026-03-28

Initial public release. Chasket is a template-first Web Component compiler that compiles `.csk` files into native Web Components with zero dependencies.

### Core

- **Compiler**: `.csk` -> Web Component (JS/TS) compilation pipeline (3,800+ lines)
- **Template syntax**: `{{ }}` interpolation, `{{{ }}}` raw interpolation, `<#if>`/`<#else>`/`<#else-if>`, `<#for>`/`<:empty>`
- **Directives**: `:bind`, `:class` (array/object/string), `:attr`, `@event` (modifiers), `@html`
- **Reactivity**: `state`, `prop`, `computed`, `fn`, `watch`, `emit`, `ref`, `provide`/`consume`
- **Type checker**: primitives, arrays, objects, union types, generics (`Array<T>`, `Map<K,V>`, `Set<T>`)
- **Shadow DOM**: `open` / `closed` / `none` modes with scoped CSS
- **TypeScript output**: `--target ts` generates `.ts` + `.d.ts`
- **Diff-based DOM**: morphdom-lite patching algorithm preserving focus and cursor position
- **Source Map V3**: `.js.map` generation for browser DevTools debugging
- **i18n**: `helpers` declaration for message catalog integration

### Packages

- **CLI** (`@chasket/chasket`): `init` / `build` / `check` / `dev` commands, HMR, `--optimize` minification
- **SSR** (`@chasket/chasket-ssr`): `renderToString()`, `renderToStream()`, hydration, page streaming
- **Router** (`@chasket/chasket-router`): hash/history mode, dynamic params, navigation guards
- **Store** (`@chasket/chasket-store`): Flux/actions/getters, undo/redo, middleware
- **UI** (`@chasket/chasket-ui`): 9 accessible components with theme customization
- **LSP** (`@chasket/chasket-lsp`): 12 features, zero-dependency, editor-agnostic
- **VSCode** (`chasket-vscode`): syntax highlighting, completion, hover, diagnostics, go-to-definition
- **Vite Plugin** (`@chasket/vite-plugin-chasket`): `.csk` auto-compilation, HMR integration

### Security

- Auto-escaping by default (`#esc`, `#escAttr`, `#escUrl`)
- URL validation against dangerous protocols (`javascript:`, `data:`, `vbscript:`)
- 37 vulnerabilities identified and fixed across 5 audit rounds
- HMR eval elimination (Blob URL approach)
- Path traversal multi-layer defense in dev server
- CSP nonce support, localhost-only binding

### Testing

- 562 tests passing (compiler 350+, CLI 23, E2E 17, SSR/Router/Store/UI/LSP/Vite)
- Zero external dependencies across all packages
