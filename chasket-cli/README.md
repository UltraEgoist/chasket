# @aspect/chasket

Template-first compiler that transforms `.csk` files into native Web Components.

Zero runtime, zero dependencies. Outputs standard `HTMLElement` classes with Shadow DOM, scoped CSS, and built-in reactivity.

## Installation

```bash
npm install @aspect/chasket
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
const { compile } = require('@aspect/chasket');

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
| [@aspect/chasket-ssr](https://www.npmjs.com/package/@aspect/chasket-ssr) | Server-side rendering |
| [@aspect/chasket-router](https://www.npmjs.com/package/@aspect/chasket-router) | Client-side SPA router |
| [@aspect/chasket-store](https://www.npmjs.com/package/@aspect/chasket-store) | Reactive state management |
| [@aspect/chasket-ui](https://www.npmjs.com/package/@aspect/chasket-ui) | Pre-built UI components |
| [@aspect/chasket-lsp](https://www.npmjs.com/package/@aspect/chasket-lsp) | Language Server Protocol |
| [@aspect/vite-plugin-chasket](https://www.npmjs.com/package/@aspect/vite-plugin-chasket) | Vite integration with HMR |

## License

[MIT](../LICENSE)
