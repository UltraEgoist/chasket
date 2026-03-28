# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.2.0] - 2026-03-28

Initial public release. Chasket is a template-first Web Component compiler that compiles `.csk` files into native Web Components with zero dependencies.

### Core

- **Compiler**: `.csk` → Web Component (JS/TS) compilation pipeline (3,800+ lines)
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

- **CLI** (`@aspect/chasket`): `init` / `build` / `check` / `dev` commands, HMR, `--optimize` minification
- **SSR** (`@aspect/chasket-ssr`): `renderToString()`, `renderToStream()`, hydration, page streaming
- **Router** (`@aspect/chasket-router`): hash/history mode, dynamic params, navigation guards
- **Store** (`@aspect/chasket-store`): Flux/actions/getters, undo/redo, middleware
- **UI** (`@aspect/chasket-ui`): 9 accessible components with theme customization
- **LSP** (`@aspect/chasket-lsp`): 12 features, zero-dependency, editor-agnostic
- **VSCode** (`chasket-vscode`): syntax highlighting, completion, hover, diagnostics, go-to-definition
- **Vite Plugin** (`@aspect/vite-plugin-chasket`): `.csk` auto-compilation, HMR integration

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
