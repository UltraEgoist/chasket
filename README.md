# Chasket 🔥

**[Documentation & Guide](https://chasket.dev)**

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
- **XSS-safe** — All `{{ }}` interpolation is auto-escaped. Opt in to raw HTML with `{{{ }}}` (with compiler warning) or `@html`.

## Quick start

```bash
# 1. Clone and enter the repository
git clone <repo-url> && cd chasket

# 2. Create a new project
node chasket-cli/bin/chasket.js init my-app
cd my-app

# 3. Build
node ../chasket-cli/bin/chasket.js build

# 4. Start dev server (live reload)
node ../chasket-cli/bin/chasket.js dev
# → Open http://localhost:3000
```

Or from an existing project with `chasket.config.json`:

```bash
node chasket-cli/bin/chasket.js build    # Production build
node chasket-cli/bin/chasket.js check    # Type check only
```

## Language overview

### Script declarations

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

### Template syntax

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

### Event modifiers

```chasket
<form @submit|prevent="handleSubmit">
<div @click|stop="handleClick">
<input @keydown|enter="search">
```

### Emit options

```chasket
emit close: { reason: string }              // Default: bubbles + composed
emit(bubbles) notify: void                  // Bubbles only
emit(composed) select: { id: number }       // Crosses Shadow DOM only
emit(local) internal: void                  // Self only
```

## Build output

```
dist/
├── chasket-bundle.js        ← All components bundled (use this)
└── components/            ← Individual files (for standalone use)
    ├── app.js
    ├── button.js
    └── card.js
```

```html
<!-- One script tag loads everything -->
<script src="dist/chasket-bundle.js"></script>
<x-app></x-app>
```

## Component composition

Components reference each other by tag name. No import required at runtime.

```chasket
<template>
  <x-card title="Users">
    <x-button label="Add" @press="addUser" />
  </x-card>
</template>
```

The bundle registers all components before any `connectedCallback` fires, so nesting works regardless of file order.

## Editor support

### VS Code

```bash
cp -r chasket-vscode ~/.vscode/extensions/chasket-lang-0.1.0
```

Features: syntax highlighting, real-time diagnostics, auto-completion, hover docs, Go to Definition, document outline, and file icons.

### Any LSP-compatible editor (Neovim, Sublime, Emacs, Helix)

```bash
npx chasket-lsp --stdio
```

The LSP server provides completion, hover, definition jump, references, rename, folding, signature help, formatting, code actions, and diagnostics. See [LSP API docs](docs/api/chasket-lsp.md) for editor-specific setup instructions.

## Server-side rendering

```javascript
const { renderToString, renderPage } = require('@chasket/chasket-ssr');

const html = renderToString(source, { hydrate: true });
const page = renderPage({ title: 'My App', body: html, hydrate: true });
```

See [SSR API docs](docs/api/chasket-ssr.md) for Express/Fastify integration examples.

## CLI commands

| Command | Description |
|---------|-------------|
| `chasket init <name>` | Create new project |
| `chasket dev` | Dev server with file watching |
| `chasket build` | Production build |
| `chasket check` | Type check only |

## Ecosystem

| Package | Description |
|---------|-------------|
| `@chasket/chasket` | Compiler & CLI |
| `@chasket/chasket-ssr` | Server-side rendering with hydration support |
| `@chasket/chasket-lsp` | Language Server Protocol for any editor |
| `@chasket/chasket-router` | SPA routing with `<chasket-router>`, `<chasket-link>` |
| `@chasket/chasket-store` | Flux-like state management with undo/redo |
| `@chasket/chasket-ui` | 9 accessible UI components (`<fl-button>`, `<fl-dialog>`, etc.) |
| `@chasket/vite-plugin-chasket` | Vite integration with HMR |
| `chasket-vscode` | VS Code extension (LSP or inline mode) |
| `chasket-compiler-rust` | Experimental Rust compiler (parser stage) |

## Documentation

- [Getting Started ガイド](docs/getting-started.md) — 初めての方はこちら
- [API リファレンス](docs/API.md) — Chasket 言語構文の完全なリファレンス
- [SSR ガイド](docs/api/chasket-ssr.md) — サーバーサイドレンダリング
- [LSP ガイド](docs/api/chasket-lsp.md) — エディタ統合・Language Server
- [Router API](docs/api/chasket-router.md) / [Store API](docs/api/chasket-store.md) / [UI API](docs/api/chasket-ui.md)
- [技術学習ガイド](docs/LEARNING_GUIDE.md) — コンパイラの内部構造
- [セキュリティポリシー](SECURITY.md) — 脆弱性報告とセキュリティ設計原則
- [ロードマップ](docs/ROADMAP.md) — 今後の開発計画

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full development roadmap.

**Current (v0.2.x):** Lightweight, zero-dependency drop-in Web Components — compiler quality, npm publication
**Next (v0.3.x):** Small-to-medium SPA — keyed list reconciliation, dynamic slots
**Future (v0.4.x+):** Full-scale SPA — Rust compiler codegen, ESM bundles, DevTools
- [x] Phase 5: Security audit and fixes (SEC-01 through SEC-06, 5/6 resolved)
- [x] `{{{ }}}` raw interpolation with W0210 warning
- [x] `txBody()` recursive scope analysis for watch/fn/lifecycle blocks
- [x] Enhanced event handler validation (W0211 warnings)
- [ ] npm package publishing & CI/CD
- [ ] Rust compiler code generation & WASM output
- [ ] Playwright E2E tests

## Security

- All `{{ }}` text interpolation is HTML-escaped via `#esc()` (including single quotes)
- All dynamic attributes (`:src`, `:class`, etc.) are escaped via `#escAttr()`
- `{{{ }}}` raw interpolation bypasses escaping — compiler emits W0210 warning
- `@html` is intentionally unescaped — use only with trusted data
- Event handlers are validated for dangerous patterns (eval, import(), require(), etc.)
- Each component is wrapped in an IIFE for scope isolation
- CSP nonce-based security, blob: only when HMR is active
- 37 security vulnerabilities fixed across 5 audit rounds
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## License

MIT
