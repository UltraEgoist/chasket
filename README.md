# Chasket

**[Documentation & Guide](https://chasket.dev)** | [日本語](README.ja.md)

A template-first language that compiles to native Web Components.

Write `.csk` files with a simple, declarative syntax — get zero-runtime Custom Elements with Shadow DOM, scoped CSS, reactivity, and type checking out of the box.

```chasket
<meta>
  name: "x-counter"
  shadow: open
</meta>

<script>
  /** Current count value */
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <button @click="increment">Count: {{ count }}</button>
</template>

<style>
  button { padding: 8px 16px; border-radius: 8px; }
</style>
```

## Why Chasket?

- **Zero runtime** — Compiles to standard `HTMLElement` classes. No framework, no virtual DOM, no runtime library.
- **Single-file components** — `<meta>`, `<script>`, `<template>`, `<style>` in one `.csk` file.
- **Works everywhere** — Output is vanilla Web Components. Use with React, Vue, Svelte, or plain HTML.
- **Built-in reactivity** — `state` changes automatically update the DOM.
- **Scoped CSS** — Shadow DOM isolates styles by default.
- **Type-checked** — Catches undefined variables, type mismatches, and typos at compile time.
- **ES Module & TypeScript support** — Import from `.ts` / `.js` files. TypeScript is auto-transpiled.
- **XSS-safe** — All `{{ }}` interpolation is auto-escaped. Opt in to raw HTML with `{{{ }}}` (with compiler warning) or `@html`.

## Quick Start

```bash
# Create a new project (interactive setup)
npm create chasket

# Or with a project name
npm create chasket my-app
```

The interactive setup lets you choose a template (minimal counter, todo app, or SPA) and generates a ready-to-run project. Supports English and Japanese.

```bash
cd my-app
npm install
npm run dev
# Open http://localhost:3000
```

You can also use `npx` directly:

```bash
npx @chasket/chasket init my-app
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `chasket init` | Create a new project (interactive) |
| `chasket dev` | Dev server with live reload & HMR |
| `chasket build` | Production build |
| `chasket check` | Type check only |

## Language Overview

### Script Declarations

```chasket
<script>
  state count: number = 0            // Reactive variable
  prop  label: string = "default"    // External attribute
  computed total: number = a + b     // Derived value (read-only)
  ref   canvas: HTMLCanvasElement    // DOM reference

  fn increment() { count += 1 }     // Method (auto-updates DOM)
  fn async fetchData() { ... }       // Async method

  emit close: { reason: string }     // Custom event (bubbles + composed)
  emit(local) internal: void         // Non-bubbling event

  watch(count) { localStorage.setItem("count", String(count)) }

  on mount { console.log("connected") }
  on unmount { console.log("disconnected") }
</script>
```

### Template Syntax

```chasket
<template>
  {{ expression }}                         <!-- Text (auto-escaped) -->
  <img :src="imageUrl" />                  <!-- Dynamic attribute -->
  <button @click="handler">Click</button>  <!-- Event listener -->
  <input :bind="text" />                   <!-- Two-way binding -->
  <div @html="rawContent"></div>           <!-- Raw HTML (opt-in) -->

  <#if condition="count > 0">              <!-- Conditional -->
    <p>{{ count }} items</p>
  <:else>
    <p>No items</p>
  </#if>

  <#for each="item, index" of="items" key="item.id">
    <li>{{ item.name }}</li>               <!-- Loop -->
    <:empty><p>Empty list</p></:empty>
  </#for>

  <slot name="header"></slot>              <!-- Web Component slot -->
</template>
```

### Event Modifiers

```chasket
<form @submit|prevent="handleSubmit">
<div @click|stop="handleClick">
<input @keydown|enter="search">
```

### ES Module Imports (v0.3+)

Components can import from external `.ts` / `.js` files. When imports are present, the compiler outputs ES Module format.

```chasket
<script>
  import { createStore } from '../lib/store';

  const store = createStore();
  state count: number = 0
</script>
```

TypeScript files in `src/lib/` are automatically transpiled to `dist/lib/`. Load the bundle with `type="module"`:

```html
<script type="module" src="dist/chasket-bundle.js"></script>
```

## Build Output

```
dist/
├── chasket-bundle.js        <- All components bundled (use this)
├── lib/                     <- Transpiled TypeScript files
└── components/              <- Individual files (for standalone use)
    ├── app.js
    ├── button.js
    └── card.js
```

```html
<!-- One script tag loads everything -->
<script type="module" src="dist/chasket-bundle.js"></script>
<x-app></x-app>
```

## Component Composition

Components reference each other by tag name. No import required at runtime.

```chasket
<template>
  <x-card title="Users">
    <x-button label="Add" @press="addUser" />
  </x-card>
</template>
```

The bundle registers all components before any `connectedCallback` fires, so nesting works regardless of file order.

## Editor Support

### VS Code

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) or search "Chasket" in the Extensions panel.

Features: syntax highlighting, real-time diagnostics, auto-completion, hover docs, Go to Definition, document outline, and file icons.

### Any LSP-Compatible Editor (Neovim, Sublime, Emacs, Helix)

```bash
npx chasket-lsp --stdio
```

The LSP server provides completion, hover, definition jump, references, rename, folding, signature help, formatting, code actions, and diagnostics. See [LSP API docs](docs/api/chasket-lsp.md) for editor-specific setup.

## Server-Side Rendering

```javascript
const { renderToString, renderPage } = require('@chasket/chasket-ssr');

const html = renderToString(source, { hydrate: true });
const page = renderPage({ title: 'My App', body: html, hydrate: true });
```

See [SSR API docs](docs/api/chasket-ssr.md) for Express/Fastify integration examples.

## Ecosystem

| Package | Description |
|---------|-------------|
| [`@chasket/chasket`](https://www.npmjs.com/package/@chasket/chasket) | Compiler & CLI |
| [`create-chasket`](https://www.npmjs.com/package/create-chasket) | Project scaffolding (`npm create chasket`) |
| `@chasket/chasket-ssr` | Server-side rendering with hydration support |
| `@chasket/chasket-lsp` | Language Server Protocol for any editor |
| `@chasket/chasket-router` | SPA routing with `<chasket-router>`, `<chasket-link>` |
| `@chasket/chasket-store` | Flux-like state management with undo/redo |
| `@chasket/chasket-ui` | 9 accessible UI components (`<fl-button>`, `<fl-dialog>`, etc.) |
| `@chasket/vite-plugin-chasket` | Vite integration with HMR |
| [`chasket-vscode`](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) | VS Code extension |
| `chasket-compiler-rust` | Experimental Rust compiler (parser stage) |

## Documentation

- [Getting Started](docs/getting-started.md) — First steps with Chasket
- [API Reference](docs/API.md) — Complete language syntax reference
- [ES Module & TypeScript Guide](docs/module-and-typescript.md) — Import and TypeScript support
- [SSR Guide](docs/api/chasket-ssr.md) — Server-side rendering
- [LSP Guide](docs/api/chasket-lsp.md) — Editor integration & Language Server
- [Router API](docs/api/chasket-router.md) / [Store API](docs/api/chasket-store.md) / [UI API](docs/api/chasket-ui.md)
- [Learning Guide](docs/LEARNING_GUIDE.md) — Compiler internals
- [Security Policy](SECURITY.md) — Vulnerability reporting & security design
- [Roadmap](docs/ROADMAP.md) — Development plan
- [Contributing](CONTRIBUTING.md) — Branch strategy, commit conventions, release flow

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full development roadmap.

**Current (v0.3.x):** Interactive project scaffolding, ES Module/TypeScript imports, i18n CLI, template selection
**Next (v0.4.x):** Keyed list reconciliation, dynamic slots, small-to-medium SPA features
**Future (v0.5.x+):** Rust compiler codegen, ESM bundles, DevTools

- [x] ES Module & TypeScript import support
- [x] Interactive `chasket init` with template selection
- [x] `npm create chasket` scaffolding
- [x] CLI i18n (English / Japanese)
- [x] VS Code extension published on Marketplace
- [x] Security audit (37 vulnerabilities fixed across 5 rounds)
- [ ] Keyed diff reconciliation
- [ ] Rust compiler code generation & WASM output
- [ ] Playwright E2E tests

## Security

- All `{{ }}` text interpolation is HTML-escaped via `#esc()` (including single quotes)
- All dynamic attributes (`:src`, `:class`, etc.) are escaped via `#escAttr()`
- `{{{ }}}` raw interpolation bypasses escaping — compiler emits W0210 warning
- `@html` is intentionally unescaped — use only with trusted data
- Event handlers are validated for dangerous patterns (eval, import(), require(), etc.)
- Each component is wrapped in an IIFE for scope isolation (or ES Module when imports are used)
- CSP nonce-based security, blob: only when HMR is active
- 37 security vulnerabilities fixed across 5 audit rounds
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## License

MIT
