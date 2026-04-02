# @chasket/chasket

> Part of the [Chasket](https://chasket.dev) ecosystem.
> [日本語](#日本語)

Template-first compiler that transforms `.csk` files into native Web Components.

Zero runtime, zero dependencies. Outputs standard `HTMLElement` classes with Shadow DOM, scoped CSS, and built-in reactivity.

## Installation

```bash
npm install @chasket/chasket
```

## Quick Start

```bash
# Interactive project creation with template selection
npm create chasket

# Or specify a project name directly
npx @chasket/chasket init my-app
```

The interactive setup lets you choose from 3 templates (minimal counter, todo app, SPA) and supports English and Japanese.

## CLI Usage

```bash
# Create a new project (interactive)
chasket init

# Build for production
chasket build

# Type check without emitting
chasket check

# Start dev server with live reload & HMR
chasket dev
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

## ES Module & TypeScript Support (v0.3+)

Components can `import` from external `.ts` / `.js` files. When imports are present, the compiler outputs ES Module format (no IIFE wrapper).

```chasket
<script>
  import { createStore } from '../lib/store';
  state count: number = 0
</script>
```

TypeScript files in `src/lib/` are automatically transpiled (type-stripped) to `dist/lib/`.

```bash
# Build with TypeScript output for individual components
chasket build --target ts
```

Load the bundle with `type="module"`:

```html
<script type="module" src="dist/chasket-bundle.js"></script>
```

See [docs/module-and-typescript.md](../docs/module-and-typescript.md) for the full guide.

## i18n

The CLI auto-detects language from `CHASKET_LANG` or `LANG` environment variables. Supported languages: English (`en`), Japanese (`ja`).

```bash
# Force Japanese
CHASKET_LANG=ja npx @chasket/chasket init
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

---

## 日本語

> [Chasket](https://chasket.dev) エコシステムの一部です。

テンプレートファーストのコンパイラ。`.csk` ファイルをネイティブ Web Component に変換します。

ゼロランタイム、ゼロ依存。Shadow DOM・スコープ付き CSS・リアクティビティを備えた標準 `HTMLElement` クラスを出力します。

### インストール

```bash
npm install @chasket/chasket
```

### クイックスタート

```bash
# 対話型プロジェクト作成（テンプレート選択付き）
npm create chasket

# プロジェクト名を指定する場合
npx @chasket/chasket init my-app
```

対話型セットアップでは 3 種類のテンプレート（ミニマルカウンター・Todo アプリ・SPA）から選択でき、日本語・英語に対応しています。

### CLI コマンド

```bash
chasket init     # 新規プロジェクト作成（対話型）
chasket build    # 本番ビルド
chasket check    # 型チェックのみ
chasket dev      # 開発サーバー起動（ライブリロード & HMR）
```

### 多言語対応

CLI は `CHASKET_LANG` または `LANG` 環境変数から言語を自動検出します。対応言語: 英語 (`en`)、日本語 (`ja`)。

```bash
# 日本語を強制する場合
CHASKET_LANG=ja npx @chasket/chasket init
```

詳しい API やコンパイラの使い方については、上記の英語セクションまたは [Chasket ドキュメント](https://chasket.dev) を参照してください。
