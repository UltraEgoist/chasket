# vite-plugin-chasket API Reference

Vite で `.csk` ファイルをコンパイルするためのプラグイン。HMR（Hot Module Replacement）対応。

## Installation

```bash
npm install -D vite-plugin-chasket @chasket/chasket
```

## Setup

```javascript
// vite.config.js
import chasket from 'vite-plugin-chasket';

export default {
  plugins: [chasket()]
};
```

## Options

```javascript
chasket({
  target: 'js',       // 出力ターゲット
  optimize: false,     // Tree-shaking 最適化
  sourceMap: true,     // ソースマップ生成
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `'js' \| 'ts'` | `'js'` | コンパイラの出力ターゲット |
| `optimize` | `boolean` | `false` | Tree-shaking 最適化を有効化 |
| `sourceMap` | `boolean` | `true` | ソースマップを生成する |

## Features

### Transform

`.csk` 拡張子のファイルを自動検出し、Chasket コンパイラで JavaScript に変換します。

```javascript
// main.js — .csk ファイルをそのまま import 可能
import './components/my-button.csk';
import './components/my-card.csk';
```

### Error Handling

コンパイルエラーは Vite のエラーオーバーレイに表示されます。警告はコンソールに出力されます。

### HMR

`.csk` ファイルの変更を検知し、フルリロードを実行します。将来的には差分更新（fine-grained HMR）に対応予定です。

### Import Resolution

`.csk` ファイルの相対インポートを自動的に解決します。

```javascript
// コンポーネント間の相対インポート
import './child-component.csk';
```

### Source Maps

有効時（デフォルト）、ブラウザの DevTools で `.csk` ソースファイルを直接デバッグできます。

## Compiler Resolution

プラグインは以下の順序でコンパイラを検索します:

1. `@chasket/chasket` パッケージ（npm インストール済みの場合）
2. `../chasket-cli/lib/compiler`（モノレポ開発時の相対パス）

見つからない場合はエラーをスローします。

## Usage with Chasket Router / Store

```javascript
// vite.config.js
import chasket from 'vite-plugin-chasket';

export default {
  plugins: [chasket()],
  resolve: {
    alias: {
      '@chasket/chasket-router': '/path/to/chasket-router/index.mjs',
      '@chasket/chasket-store': '/path/to/chasket-store/index.js',
    }
  }
};
```
