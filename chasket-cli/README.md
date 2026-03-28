# @chasket/chasket

Template-first compiler that transforms `.csk` files into native Web Components.

Zero runtime, zero dependencies. Outputs standard `HTMLElement` classes with Shadow DOM, scoped CSS, and built-in reactivity.

## Installation

```bash
npm install @chasket/chasket
```

## CLI Usage

```bash
# Create a new project
npx chasket init my-app

# Build for production
npx chasket build

# Type check without emitting
npx chasket check

# Start dev server with live reload
npx chasket dev
```

## Compiler API

```javascript
const { compile } = require('@chasket/chasket');

const result = compile(source, 'my-component.csk', {
  target: 'js',
  optimize: false,
});

if (result.success) {
  console.log(result.output);  // Generated JavaScript
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `'js' \| 'ts'` | `'js'` | Output target |
| `optimize` | `boolean` | `false` | Enable tree-shaking optimization |
| `componentRegistry` | `Map` | - | Component registry for auto-imports |

### Result

```typescript
interface CompileResult {
  success: boolean;
  output?: string;             // Generated JavaScript
  dtsOutput?: string;          // TypeScript declarations (.d.ts)
  diagnostics: Diagnostic[];   // Errors and warnings
  sourceMap?: object;
  meta?: {
    name: string;
    shadow: string;
    form: boolean;
  };
}
```

## Example

```chasket
<meta>
  name: "x-counter"
  shadow: open
</meta>

<script>
  state count: number = 0
  fn increment() { count += 1 }
</script>

<template>
  <button @click="increment">Count: {{ count }}</button>
</template>

<style>
  button { padding: 8px 16px; border-radius: 8px; }
</style>
```

## Ecosystem

| Package | Description |
|---------|-------------|
| [@chasket/chasket-ssr](https://www.npmjs.com/package/@chasket/chasket-ssr) | Server-side rendering |
| [@chasket/chasket-router](https://www.npmjs.com/package/@chasket/chasket-router) | Client-side SPA router |
| [@chasket/chasket-store](https://www.npmjs.com/package/@chasket/chasket-store) | Reactive state management |
| [@chasket/chasket-ui](https://www.npmjs.com/package/@chasket/chasket-ui) | Pre-built UI components |
| [@chasket/chasket-lsp](https://www.npmjs.com/package/@chasket/chasket-lsp) | Language Server Protocol |
| [@chasket/vite-plugin-chasket](https://www.npmjs.com/package/@chasket/vite-plugin-chasket) | Vite integration with HMR |

## License

[MIT](../LICENSE)
