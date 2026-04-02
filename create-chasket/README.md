# create-chasket

> Scaffolding tool for [Chasket](https://chasket.dev) projects.

Create a new Chasket project with a single command:

```bash
npm create chasket
```

## Usage

```bash
# Interactive mode (recommended)
npm create chasket

# With project name
npm create chasket my-app
```

The interactive setup will guide you through:

1. **Project name** — Directory name and package name
2. **Template selection** — Choose with arrow keys:
   - **Minimal** — Simple counter app (recommended for beginners)
   - **Todo App** — Full todo application with state management
   - **SPA** — Multi-page single-page application with routing

Supports English and Japanese (auto-detected from environment).

## After Scaffolding

```bash
cd my-app
npm install
npm run dev
# Open http://localhost:3000
```

## How It Works

This is a thin wrapper that delegates to `@chasket/chasket init`. It exists so that `npm create chasket` (or `npm init chasket`) works out of the box.

## License

[MIT](../LICENSE)

---

## 日本語

Chasket プロジェクトのスキャフォールディングツールです。

```bash
npm create chasket
```

対話型セットアップで 3 種類のテンプレート（ミニマルカウンター・Todo アプリ・SPA）から選択できます。日本語・英語対応。

```bash
cd my-app
npm install
npm run dev
# http://localhost:3000 をブラウザで開く
```
