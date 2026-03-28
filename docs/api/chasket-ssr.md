# @chasket/chasket-ssr API Reference

Chasket コンポーネントをサーバーサイドで HTML にレンダリングするためのパッケージ。SEO 対応、初期表示の高速化、ハイドレーションによるクライアント側の活性化をサポートします。

## Installation

```bash
npm install @chasket/chasket-ssr
```

## Quick Start

```javascript
const { renderToString, renderPage } = require('@chasket/chasket-ssr');
const fs = require('fs');

// .csk ソースを読み込み
const source = fs.readFileSync('src/my-counter.csk', 'utf8');

// HTML 文字列に変換
const html = renderToString(source);
console.log(html);
// → <x-counter><button>Click me: 0</button></x-counter>

// ハイドレーション対応付きで完全な HTML ページ生成
const page = renderPage({
  title: 'My Chasket App',
  body: html,
  bundlePath: '/dist/chasket-bundle.js',
});
```

---

## renderToString(source, options?)

`.csk` ソースコードを HTML 文字列にレンダリングします。

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | `string` | (required) | `.csk` ファイルのソースコード |
| `options.props` | `Record<string, any>` | `{}` | prop の初期値をオーバーライド |
| `options.state` | `Record<string, any>` | `{}` | state の初期値をオーバーライド |
| `options.hydrate` | `boolean` | `false` | ハイドレーションマーカーを付加するか |

### Returns

`string` — レンダリングされた HTML 文字列

### Examples

#### 基本的な使い方

```javascript
const source = `
<meta>
  name: "x-hello"
</meta>
<script>
  prop name: string = "World"
</script>
<template>
  <p>Hello, {{ name }}!</p>
</template>
`;

const html = renderToString(source);
// → '<x-hello><p>Hello, World!</p></x-hello>'
```

#### props のオーバーライド

```javascript
const html = renderToString(source, {
  props: { name: 'Chasket' }
});
// → '<x-hello><p>Hello, Chasket!</p></x-hello>'
```

#### state のオーバーライド

```javascript
const counterSource = `
<meta>name: "x-counter"</meta>
<script>
  state count: number = 0
</script>
<template>
  <span>Count: {{ count }}</span>
</template>
`;

const html = renderToString(counterSource, {
  state: { count: 42 }
});
// → '<x-counter><span>Count: 42</span></x-counter>'
```

#### ハイドレーション付き

```javascript
const html = renderToString(source, {
  hydrate: true
});
// → '<x-hello data-chasket-hydrate data-chasket-state="..."><p>Hello, World!</p></x-hello>'
```

ハイドレーション有効時、出力に以下の属性が付加されます:

| 属性 | 用途 |
|------|------|
| `data-chasket-hydrate` | クライアント側でハイドレーション対象として識別 |
| `data-chasket-state` | state の初期値を JSON エンコードして保持 |

---

## renderPage(options)

完全な HTML ドキュメントを生成します。SEO に必要な `<meta>` タグ、`<title>`、バンドルスクリプトの読み込みを含みます。

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.title` | `string` | `'Chasket App'` | ページタイトル (`<title>` タグ) |
| `options.body` | `string` | `''` | `<body>` 内に挿入する HTML |
| `options.bundlePath` | `string` | `'/dist/chasket-bundle.js'` | バンドル JS のパス |
| `options.meta` | `Record<string, string>` | `{}` | 追加の `<meta>` タグ |
| `options.lang` | `string` | `'en'` | HTML の `lang` 属性 |
| `options.hydrate` | `boolean` | `false` | ハイドレーションランタイムを含めるか |

### Returns

`string` — 完全な HTML ドキュメント

### Example

```javascript
const { renderToString, renderPage, getHydrationRuntime } = require('@chasket/chasket-ssr');

const source = fs.readFileSync('src/app.csk', 'utf8');
const body = renderToString(source, { hydrate: true });

const html = renderPage({
  title: 'My App',
  body,
  bundlePath: '/dist/chasket-bundle.js',
  lang: 'ja',
  meta: {
    description: 'Chasket で作ったアプリケーション',
    viewport: 'width=device-width, initial-scale=1',
  },
  hydrate: true,
});

// Express で返す
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
```

---

## getHydrationRuntime()

クライアント側のハイドレーションスクリプトを返します。サーバーレンダリングされたコンポーネントをクライアント側で活性化（インタラクティブに）するために使います。

### Returns

`string` — ハイドレーション用の JavaScript コード

### Example

```javascript
const runtime = getHydrationRuntime();
// <script> タグ内に埋め込む
const html = `<script>${runtime}</script>`;
```

通常は `renderPage({ hydrate: true })` を使えば自動的に含まれるため、直接呼ぶ必要はありません。

---

## テンプレート機能のサポート状況

SSR で利用可能なテンプレート構文の一覧です。

| 構文 | サポート | 備考 |
|------|----------|------|
| `{{ expression }}` | ✅ | 自動 HTML エスケープ付き |
| `:attr="expr"` | ✅ | 動的属性バインディング |
| `<#if condition="...">` | ✅ | `<:else>`, `<:else-if>` 含む |
| `<#for each="..." of="...">` | ✅ | `<:empty>` 含む |
| `@click="handler"` | ❌ | サーバー上ではイベント無視 |
| `:bind="state"` | ❌ | サーバー上では無視（初期値のみ反映） |
| `<slot>` | ❌ | SSR では非対応 |
| `@html="expr"` | ⚠️ | 信頼できるデータのみ使用 |

---

## セキュリティ

SSR は以下のセキュリティ機能を内蔵しています:

| 関数 | 用途 |
|------|------|
| `escapeHtml(str)` | `<`, `>`, `&`, `"`, `'` をHTMLエンティティに変換 |
| `escapeAttr(str)` | 属性値のエスケープ |
| `escapeUrl(str)` | `javascript:`, `data:`, `vbscript:` スキームをブロック（iterative decode 対応） |

`{{ }}` 補間はすべて `escapeHtml()` を自動適用します。`@html` ディレクティブのみエスケープされません。

---

## Express/Fastify 統合例

### Express

```javascript
const express = require('express');
const fs = require('fs');
const { renderToString, renderPage } = require('@chasket/chasket-ssr');

const app = express();
const source = fs.readFileSync('src/app.csk', 'utf8');

app.use(express.static('dist'));

app.get('/', (req, res) => {
  const body = renderToString(source, { hydrate: true });
  const html = renderPage({
    title: 'My App',
    body,
    bundlePath: '/dist/chasket-bundle.js',
    hydrate: true,
  });
  res.send(html);
});

app.listen(3000);
```

### Fastify

```javascript
const fastify = require('fastify')();
const fs = require('fs');
const { renderToString, renderPage } = require('@chasket/chasket-ssr');

const source = fs.readFileSync('src/app.csk', 'utf8');

fastify.get('/', async (req, reply) => {
  const body = renderToString(source, { hydrate: true });
  const html = renderPage({
    title: 'My App',
    body,
    bundlePath: '/dist/chasket-bundle.js',
    hydrate: true,
  });
  reply.type('text/html').send(html);
});

fastify.listen({ port: 3000 });
```

---

## TypeScript

TypeScript 型定義が `index.d.ts` に含まれています。

```typescript
import { renderToString, renderPage, getHydrationRuntime } from '@chasket/chasket-ssr';

const html: string = renderToString(source, {
  props: { name: 'World' },
  state: { count: 0 },
  hydrate: true,
});
```
