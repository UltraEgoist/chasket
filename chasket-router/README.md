# @chasket/chasket-router

> Part of the [Chasket](https://chasket.dev) ecosystem.

Client-side SPA router for Chasket applications. History API based routing with dynamic parameters, nested routes, guards, and Web Component integration.

Zero dependencies.

## Installation

```bash
npm install @chasket/chasket-router
```

## Quick Start

```javascript
import { createRouter } from '@chasket/chasket-router';

const router = createRouter({
  routes: [
    { path: '/', component: 'x-home' },
    { path: '/users/:id', component: 'x-user-detail' },
    { path: '/about', component: 'x-about' },
    { path: '*', component: 'x-not-found' },
  ],
});

document.querySelector('chasket-router').router = router;
router.start();
```

```html
<chasket-router>
  <chasket-link to="/">Home</chasket-link>
  <chasket-link to="/about">About</chasket-link>
  <chasket-route></chasket-route>
</chasket-router>
```

## API

### createRouter(options)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routes` | `RouteConfig[]` | `[]` | Route definitions |
| `mode` | `'history' \| 'hash'` | `'history'` | Routing mode |
| `base` | `string` | `''` | Base path prefix |

### RouteConfig

```typescript
interface RouteConfig {
  path: string;              // Route pattern (e.g. '/users/:id')
  component: string;         // Custom element tag name
  meta?: object;             // Arbitrary metadata
  children?: RouteConfig[];  // Nested child routes
}
```

### Router instance

| Method | Description |
|--------|-------------|
| `start()` | Begin listening for navigation |
| `push(path)` | Navigate to a path |
| `replace(path)` | Replace current history entry |
| `back()` | Go back in history |
| `beforeEach(guard)` | Register a navigation guard |

### Built-in elements

| Element | Description |
|---------|-------------|
| `<chasket-router>` | Router container |
| `<chasket-route>` | Route outlet (renders matched component) |
| `<chasket-link>` | Navigation link (`to` attribute) |

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@chasket/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
