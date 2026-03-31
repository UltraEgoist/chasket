# Chasket — ES Module & TypeScript Support

## Overview

Since Chasket v0.3.0, `.csk` components can `import` from external TypeScript / JavaScript files. This enables logic separation and code reuse across components.

---

## Project Structure

```
my-project/
├── chasket.config.json
├── package.json
├── src/
│   ├── components/
│   │   ├── my-counter.csk
│   │   └── my-header.csk
│   ├── lib/
│   │   ├── reactive.ts      ← TS library
│   │   └── utils.ts
│   └── index.html
└── dist/                     ← Build output
    ├── chasket-bundle.js
    ├── components/
    │   ├── my-counter.js
    │   └── my-header.js
    └── lib/
        ├── reactive.js       ← Auto-transpiled
        └── utils.js
```

---

## 1. Using Modules (with imports)

### Writing .csk files with imports

```html
<meta>
  name: my-counter
</meta>

<script>
  import ReactiveNode from '../lib/reactive';
  import { formatDate } from '../lib/utils';

  const node = ReactiveNode.createReacterNode();
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <div>
    <span>{{ count }}</span>
    <button @click="increment">+1</button>
  </div>
</template>
```

### Build output behavior

When `import` statements are present, the compiler automatically:

- Omits the IIFE wrapper `(() => { ... })()`  and outputs ES Module format
- Rewrites `.ts` / `.tsx` extensions in imports to `.js`
- Omits `"use strict"` (ES Modules are strict by specification)

Output example:

```javascript
/* Built with Chasket v0.3.0 */
import ReactiveNode from '../lib/reactive.js';

class MyCounter extends HTMLElement {
  // ...
}

customElements.define('my-counter', MyCounter);
```

### Loading in HTML

Bundles containing `import` statements require `type="module"`:

```html
<script type="module" src="dist/chasket-bundle.js"></script>
```

### Automatic TypeScript transpilation

`.ts` files inside `src/` (excluding `components/` and `.d.ts` files) are automatically type-stripped and output as `.js` in `dist/`.

Supported type stripping:

- Type annotations (`x: string`, `: ReturnType<T>`)
- `interface` / `type` declarations
- `enum` declarations
- Generics (`<T>`, `Set<Type>()`, arrow functions `<T>() =>`)
- `as` casts / non-null assertions (`!`)
- `public` / `private` / `protected` / `readonly`
- TypeScript `this` parameters
- `import type` / `export type`
- Type-only class field declarations

For complex TypeScript, pre-compiling with `tsc` or `esbuild` is recommended.

---

## 2. Without Modules (no imports)

When there are no `import` statements and `--target ts` is not specified, the output uses a traditional IIFE wrapper.

```html
<script>
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <button @click="increment">{{ count }}</button>
</template>
```

Output:

```javascript
/* Built with Chasket v0.3.0 */
(() => {
"use strict";

class MyCounter extends HTMLElement {
  // ...
}

customElements.define('my-counter', MyCounter);
})();
```

This can be loaded with a regular `<script>` tag:

```html
<script src="dist/chasket-bundle.js"></script>
```

---

## 3. TypeScript Output (--target ts)

Using `--target ts` outputs individual components as `.ts` files with type annotations.

```bash
chasket build --target ts
```

Or in `chasket.config.json`:

```json
{
  "target": "ts"
}
```

The bundle (`chasket-bundle.js`) is always output as JavaScript (without types), since it runs directly in the browser.

---

## 4. chasket.config.json

```json
{
  "src": "src",
  "outdir": "dist",
  "bundle": "chasket-bundle.js",
  "target": "js",
  "shadow": "open"
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `src` | Source directory. Recursively searches for `.csk` and `.ts` files | `src/components` |
| `outdir` | Build output directory | `dist` |
| `bundle` | Bundle file name | `chasket-bundle.js` |
| `target` | Individual output format: `js` or `ts` | `js` |
| `shadow` | Shadow DOM mode: `open` / `closed` / `none` | `open` |

### Source directory patterns

The value of `src` affects directory structure.

**`"src": "src/components"` (traditional layout):**

```
src/components/my-counter.csk → dist/components/my-counter.js
```

TS transpilation searches `src/` (parent of `components/`), so `src/lib/` etc. are included.

**`"src": "src"` (flexible layout):**

```
src/components/my-counter.csk → dist/components/my-counter.js
src/lib/reactive.ts           → dist/lib/reactive.js
```

The directory structure is mirrored into `dist/`.

---

## 5. TypeScript in Dev Server

When using `chasket dev`, `.ts` files are transpiled on the fly.

When the browser requests a `.js` file and no corresponding `.js` exists, the dev server looks for a `.ts` file with the same name, strips the types, and serves it as JavaScript. Just save the file and changes are reflected immediately.

---

## 6. Import Rules

### Supported import forms

```javascript
// Default import
import ReactiveNode from '../lib/reactive';

// Named import
import { formatDate, parseJSON } from '../lib/utils';

// Default + named
import ReactiveNode, { Signal } from '../lib/reactive';

// Namespace import
import * as Utils from '../lib/utils';

// Side-effect import
import '../lib/polyfill';

// Type-only import (output with --target ts, removed for JS)
import type { NodeType } from '../lib/types';
```

### Path resolution

- Only relative paths (`./` / `../`) are resolved and rewritten
- `.ts` / `.tsx` extensions are automatically converted to `.js`
- Paths without extensions get `.js` appended
- npm package names (bare specifiers like `'react'`) pass through unchanged

### Bundle behavior

During bundle generation, each component's `import` statements are processed as follows:

- Imports to other components within the bundle → automatically removed (self-contained)
- Imports to external files → rewritten to relative paths from the bundle file location
- Import statements are hoisted to the top of the bundle and deduplicated

---

## 7. Security Considerations

- Path traversal prevention: `../` paths outside the source root are not rewritten
- ReDoS protection: regex quantifiers in `stripTypes` are bounded (200-char limit)
- Dev server TS serving is limited to project files only (`allowedRoots` check)
- Bare specifiers in bundle imports are not modified (safe pass-through of npm package names)
