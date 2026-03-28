# Getting Started

Chasket は `.csk` 単一ファイルコンポーネントからネイティブ Web Components にコンパイルするフレームワークです。

## インストール

```bash
npm install -g @aspect/chasket-cli
```

## プロジェクト作成

```bash
chasket init my-app
cd my-app
```

生成されるプロジェクト構造:

```bash
my-app/
  src/
    components/
      my-app.csk
  dist/
  index.html
  chasket.config.json
  package.json
```

## はじめてのコンポーネント

`src/components/hello-world.csk` を作成します:

```chasket
<meta>
  name: "hello-world"
  shadow: open
</meta>
<script>
  prop name: string = "World"
  state greeting: string = "Hello"
  computed message: string = `${greeting}, ${name}!`
</script>
<template>
  <div class="hello">
    <h1>{{ message }}</h1>
    <button @click="toggleGreeting">Toggle</button>
  </div>
</template>
<style>
  .hello { text-align: center; padding: 2rem; }
  h1 { color: #f97316; }
  button { padding: 0.5rem 1rem; cursor: pointer; }
</style>
```

## .csk ファイルの構造

すべての `.csk` ファイルは4つのブロックで構成されます:

```chasket
<meta>
  name: "my-component"  // カスタム要素名（ハイフン必須）
  shadow: open          // open | closed | none
</meta>
<script>
  // 状態・プロパティ・ロジック定義
</script>
<template>
  // HTMLテンプレート
</template>
<style>
  // CSSスタイル（Shadow DOM or Scoped）
</style>
```

## ビルド

```bash
chasket build src/components
```

`dist/` ディレクトリに以下が生成されます:

- 個別コンポーネントの `.js` ファイル
- `chasket-bundle.js`（全コンポーネントのバンドル）
- `chasket-bundle.min.js`（ミニファイ版）

## 開発サーバー

```bash
chasket dev
```

HMR（Hot Module Replacement）付きの開発サーバーが起動します。ファイルを保存すると自動的にブラウザが更新されます。

## HTMLで使用

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="dist/chasket-bundle.js"></script>
</head>
<body>
  <hello-world name="Chasket"></hello-world>
</body>
</html>
```

## TypeScript出力

```bash
chasket build src/components --target ts
```

`.ts` ファイルと `.d.ts` 型定義ファイルが生成されます。

## Vite統合

```bash
npm install vite-plugin-chasket --save-dev
```

```javascript
// vite.config.js
const chasketPlugin = require('vite-plugin-chasket');

module.exports = {
  plugins: [chasketPlugin()],
};
```

## 次のステップ

- [コンポーネント構文](/components.html) — state, prop, computed, fn, emit の詳細
- [API リファレンス](/api.html) — コンパイラ・CLI・SSR の全API
- [SSR](/ssr.html) — サーバーサイドレンダリングの使い方
- [ルーター](/router.html) — SPA ルーティング
- [ストア](/store.html) — 状態管理
