# @chasket/chasket-ssr

Server-side rendering for Chasket components. Render `.csk` files to HTML strings on the server with hydration support for client-side activation.

Zero dependencies.

## Installation

```bash
npm install @chasket/chasket-ssr
```

## Quick Start

```javascript
const { renderToString, renderPage } = require('@chasket/chasket-ssr');
const fs = require('fs');

const source = fs.readFileSync('src/my-counter.csk', 'utf8');

// Render to HTML string
const html = renderToString(source);

// Generate a full HTML page with hydration
const page = renderPage({
  title: 'My Chasket App',
  body: html,
  bundlePath: '/dist/chasket-bundle.js',
});
```

## API

### renderToString(source, options?)

Renders a `.csk` source to an HTML string.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `props` | `Record<string, any>` | `{}` | Override initial prop values |
| `state` | `Record<string, any>` | `{}` | Override initial state values |
| `hydrate` | `boolean` | `false` | Add hydration markers |

Returns: `string`

### renderPage(options)

Generates a complete HTML page wrapping rendered components.

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Page title |
| `body` | `string` | Rendered HTML body |
| `bundlePath` | `string` | Path to client-side bundle |
| `meta` | `object` | Additional `<meta>` tags |
| `styles` | `string[]` | CSS file paths |
| `scripts` | `string[]` | Additional script paths |

### renderStream(source, options?)

Streaming alternative to `renderToString`. Returns a `Readable` stream for large pages.

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@chasket/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
