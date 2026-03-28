# @aspect/chasket-lsp

Language Server Protocol implementation for Chasket. Provides diagnostics, completions, hover, go-to-definition, and formatting for `.csk` files in any LSP-compatible editor.

Zero dependencies.

## Installation

```bash
npm install @aspect/chasket-lsp
```

## Usage

### stdio mode (default)

```bash
npx chasket-lsp --stdio
```

### From Node.js

```javascript
const { createServer } = require('@aspect/chasket-lsp');
const server = createServer(process.stdin, process.stdout);
server.start();
```

## Editor setup

### VSCode

Install the [chasket-vscode](https://github.com/UltraEgoist/chasket/tree/main/chasket-vscode) extension. It automatically starts the LSP server when available.

### Neovim (nvim-lspconfig)

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

configs.csk = {
  default_config = {
    cmd = { 'npx', 'chasket-lsp', '--stdio' },
    filetypes = { 'chasket' },
    root_dir = lspconfig.util.root_pattern('chasket.config.json', 'package.json'),
  },
}

lspconfig.csk.setup {}
```

### Sublime Text (LSP package)

```json
{
  "clients": {
    "chasket": {
      "command": ["npx", "chasket-lsp", "--stdio"],
      "selector": "source.chasket"
    }
  }
}
```

## Capabilities

| Feature | Description |
|---------|-------------|
| Diagnostics | Real-time error and warning reporting |
| Completions | State, prop, computed, and method suggestions |
| Hover | Type info and documentation on hover |
| Go to definition | Jump to symbol definitions within `.csk` files |
| Formatting | Auto-format `.csk` files |
| Document symbols | Outline view of components |

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@aspect/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
