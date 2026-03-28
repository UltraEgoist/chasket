# Server-Side Rendering (SSR)

Chasket SSR は `.csk` ソースコードからサーバー上で HTML を生成します。SEO 最適化、初期表示速度の向上、クライアント非対応環境での表示に有効です。

## 基本的な使い方

```javascript
const { renderToString } = require('@chasket/chasket-ssr');
const fs = require('fs');

const source = fs.readFileSync('src/components/my-card.csk', 'utf-8');

const html = renderToString(source, {
  props: { title: 'Welcome' },
  state: { count: 0 },
});

console.log(html);
// <my-card><style>...</style><div>Welcome: 0</div></my-card>
```

## Express での使用例

```javascript
const express = require('express');
const { renderToString, renderPage } = require('@chasket/chasket-ssr');
const fs = require('fs');

const app = express();
const cardSource = fs.readFileSync('src/components/my-card.csk', 'utf-8');

app.get('/', (req, res) => {
  const card = renderToString(cardSource, {
    props: { title: 'Hello from SSR' },
  });

  const page = renderPage({
    title: 'Chasket SSR Demo',
    body: card,
    bundlePath: '/dist/bundle.js',
  });

  res.send(page);
});

app.listen(3000);
```

## ストリーミング SSR

チャンク単位でHTMLを送信し、TTFB（Time To First Byte）を改善します。

```javascript
const { renderToStream, renderPageToStream } = require('@chasket/chasket-ssr');

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  const componentStream = renderToStream(source, {
    props: { title: 'Streaming' },
    chunkSize: 512,
  });

  const pageStream = renderPageToStream({
    title: 'Chasket SSR Streaming',
    body: componentStream,
    bundlePath: '/dist/bundle.js',
  });

  pageStream.pipe(res);
});
```

## ハイドレーション

サーバーで生成したHTMLをクライアント側で「活性化」し、インタラクティブにします。

### サーバー側

```javascript
const html = renderToString(source, {
  hydrate: true,  // data-chasket-hydrate 属性を付加
});

const page = renderPage({
  title: 'Hydrated App',
  body: html,
  bundlePath: '/dist/bundle.js',
  head: `<script>${getHydrationRuntime()}</script>`,
});
```

### クライアント側

ハイドレーションランタイムが自動的に:

- `[data-chasket-hydrate]` 要素を検出
- `data-chasket-state` から状態を復元
- `customElements.upgrade()` でコンポーネントを活性化
- マーカー属性を除去

## テンプレート機能のSSR対応

### 条件分岐

```chasket
<template>
  <#if cond="isLoggedIn">
    <p>Welcome!</p>
  <:else>
    <p>Please log in.</p>
  </#if>
</template>
```

SSR では `state` / `props` の値に基づいてサーバー上で条件評価されます。

### ループ

```chasket
<template>
  <#for each="item" of="items">
    <div>{{ item.name }}</div>
  <:empty>
    <p>No items.</p>
  </#for>
</template>
```

配列データをサーバー側で展開してHTMLを生成します。

## XSS防止

SSR出力ではすべてのインターポレーションが自動エスケープされます:

- `escapeHtml` — `<`, `>`, `&`, `"`, `'` をエンティティに変換
- `escapeAttr` — HTML属性値のエスケープ
- `escapeUrl` — `javascript:`, `data:`, `vbscript:` 等の危険なURLをブロック

`escapeUrl` は多重エンコーディング攻撃にも対応しています（最大5段階のデコード）。

## 制限事項

- `@click` 等のイベントハンドラはSSR出力に含まれません（クライアント側のみ）
- `:bind` 双方向バインディングはSSRでは静的な値になります
- `@html` ディレクティブの内容はエスケープされません（意図的な仕様）
- `createEvaluator()` は `new Function()` を使用するため、信頼できるソースコードのみ処理してください
