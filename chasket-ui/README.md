# @chasket/chasket-ui

> Part of the [Chasket](https://chasket.dev) ecosystem.

Pre-built UI component library for Chasket. All components are native Web Components with Shadow DOM style encapsulation.

Zero dependencies.

## Installation

```bash
npm install @chasket/chasket-ui
```

```html
<!-- All components -->
<script src="node_modules/@chasket/chasket-ui/dist/chasket-ui.js"></script>

<!-- Individual component -->
<script src="node_modules/@chasket/chasket-ui/dist/fl-button.js"></script>
```

## Components

### `<fl-button>`

Button with variants, sizes, and loading state.

```html
<fl-button>Click me</fl-button>
<fl-button variant="danger" size="lg">Delete</fl-button>
<fl-button loading>Saving...</fl-button>
```

### `<fl-input>`

Text input with label, validation, and form integration.

```html
<fl-input label="Email" placeholder="you@example.com" required></fl-input>
<fl-input label="Password" error="Must be 8+ characters"></fl-input>
```

### `<fl-card>`

Content container with header and footer slots.

```html
<fl-card>
  <span slot="header">Title</span>
  <p>Card content here.</p>
</fl-card>
```

### `<fl-dialog>`

Modal dialog with backdrop and focus trapping.

```html
<fl-dialog open>
  <span slot="title">Confirm</span>
  <p>Are you sure?</p>
</fl-dialog>
```

### `<fl-tabs>`

Tabbed navigation with keyboard support.

```html
<fl-tabs>
  <fl-tab label="Tab 1">Content 1</fl-tab>
  <fl-tab label="Tab 2">Content 2</fl-tab>
</fl-tabs>
```

### `<fl-alert>` `<fl-badge>` `<fl-toggle>` `<fl-spinner>`

Additional utility components for notifications, labels, switches, and loading indicators.

## Building from source

The `.csk` source files are in `components/`. To rebuild:

```bash
node build.js
```

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@chasket/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
