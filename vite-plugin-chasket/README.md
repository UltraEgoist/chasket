# @aspect/vite-plugin-chasket

Vite plugin for compiling `.csk` files with Hot Module Replacement support.

Zero dependencies (peer-depends on `vite` and `@aspect/chasket`).

## Installation

```bash
npm install -D vite-plugin-chasket @aspect/chasket
```

## Setup

```javascript
// vite.config.js
import chasket from 'vite-plugin-chasket';

export default {
  plugins: [chasket()],
};
```

## Options

```javascript
chasket({
  target: 'js',       // Output target: 'js' | 'ts'
  optimize: false,     // Enable tree-shaking optimization
  sourceMap: true,     // Generate source maps
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `'js' \| 'ts'` | `'js'` | Compiler output target |
| `optimize` | `boolean` | `false` | Tree-shaking optimization |
| `sourceMap` | `boolean` | `true` | Source map generation |

## Features

**Transform** — Automatically detects and compiles `.csk` files to JavaScript.

```javascript
// Import .csk files directly
import './components/my-button.csk';
import './components/my-card.csk';
```

**HMR** — Reloads on `.csk` file changes. Full reload by default; fine-grained HMR planned for a future release.

**Error overlay** — Compile errors display in Vite's browser error overlay. Warnings are logged to the console.

**Import resolution** — Resolves relative imports between `.csk` files automatically.

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@aspect/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
