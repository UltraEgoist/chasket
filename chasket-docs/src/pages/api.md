# API リファレンス

## CLI コマンド

### `chasket init <project-name>`

新しいChasketプロジェクトを生成します。

```bash
chasket init my-app
```

- プロジェクト名は小文字英数字・ハイフン・アンダースコア・ドットのみ使用可能
- 既存ディレクトリがある場合はエラー

### `chasket build <src-dir>`

`.csk` ファイルをコンパイルして `dist/` に出力します。

```bash
chasket build src/components
chasket build src/components --target ts
chasket build src/components --optimize
```

**オプション:**

- `--target ts` — TypeScript + .d.ts 出力
- `--optimize` — ミニファイ済みバンドル、未使用ヘルパー除去

**出力ファイル:**

- `dist/components/*.js` — 個別コンポーネント
- `dist/chasket-bundle.js` — 全コンポーネントバンドル
- `dist/chasket-bundle.min.js` — ミニファイ版（`--optimize` 時）

### `chasket check <src-dir>`

コンパイルせずに型チェック・静的解析のみ実行します。

```bash
chasket check src/components
```

### `chasket dev`

HMR 付き開発サーバーを起動します。

```bash
chasket dev
chasket dev --no-hmr
```

- デフォルトポート: 3000
- WebSocket によるファイル監視・自動更新
- CSP nonce 対応
- `--no-hmr` でフルリロードモード

---

## コンパイラ API

### `compile(source, options?)`

`.csk` ソースコードをコンパイルします。

```javascript
const { compile } = require('@aspect/chasket-cli');

const result = compile(chasketSource, {
  target: 'js',       // 'js' | 'ts'
  optimize: false,     // tree-shaking
  sourceMap: true,     // Source Map V3
});
```

**返り値:**

```javascript
{
  success: boolean,
  output: string,           // 生成コード
  dts: string,             // .d.ts (target: 'ts' 時)
  sourceMap: object,       // Source Map V3
  diagnostics: Diagnostic[], // エラー・警告
  usedHelpers: string[],   // 使用中のヘルパー関数
}
```

### `splitBlocks(source)`

`.csk` ソースを4ブロックに分割します。

```javascript
const { splitBlocks } = require('@aspect/chasket-cli');

const blocks = splitBlocks(chasketSource);
// [{ type: 'meta', content: '...', startLine: 1 }, ...]
```

### `parseTemplateNodes(template)`

テンプレート文字列をAST（抽象構文木）にパースします。

```javascript
const { parseTemplateNodes } = require('@aspect/chasket-cli');

const nodes = parseTemplateNodes('<div>{{ name }}</div>');
```

---

## SSR API

### `renderToString(source, options?)`

`.csk` ソースからHTML文字列を生成します。

```javascript
const { renderToString } = require('@aspect/chasket-ssr');

const html = renderToString(chasketSource, {
  props: { title: 'Hello' },
  state: { count: 5 },
  hydrate: false,
  includeStyle: true,
  wrapInTag: true,
});
```

**オプション:**

- `props` — プロパティのオーバーライド
- `state` — 状態のオーバーライド
- `hydrate` — `data-chasket-hydrate` マーカーを付加
- `includeStyle` — `<style>` を出力に含める
- `wrapInTag` — カスタム要素タグで囲む

### `renderToStream(source, options?)`

HTML をチャンク単位でストリーミング出力します。TTFB の改善に有効です。

```javascript
const { renderToStream } = require('@aspect/chasket-ssr');

const stream = renderToStream(chasketSource, {
  props: { title: 'Hello' },
  chunkSize: 512,
  highWaterMark: 1024,
});

stream.pipe(res);
```

### `renderPage(options)`

完全なHTMLページを生成します。

```javascript
const { renderPage } = require('@aspect/chasket-ssr');

const html = renderPage({
  title: 'My App',
  body: renderedComponents,
  lang: 'ja',
  bundlePath: '/dist/bundle.js',
  head: '<link rel="stylesheet" href="/style.css">',
  meta: { description: 'My Chasket app' },
});
```

### `renderPageToStream(options)`

完全なHTMLページをストリーミング出力します。`body` にReadableストリームを渡せます。

```javascript
const { renderPageToStream } = require('@aspect/chasket-ssr');

const stream = renderPageToStream({
  title: 'My App',
  body: componentStream,  // string or Readable
});

stream.pipe(res);
```

### `getHydrationRuntime()`

クライアント側ハイドレーション用の JavaScript コードを返します。

```javascript
const { getHydrationRuntime } = require('@aspect/chasket-ssr');

const script = getHydrationRuntime();
// <script> タグ内に挿入して使用
```

### エスケープ関数

```javascript
const { escapeHtml, escapeAttr, escapeUrl } = require('@aspect/chasket-ssr');

escapeHtml('<script>alert(1)</script>')  // &lt;script&gt;...
escapeAttr('"><img src=x>')             // &quot;&gt;&lt;img...
escapeUrl('javascript:alert(1)')         // about:blank
```

---

## Vite プラグイン

```javascript
const chasketPlugin = require('vite-plugin-chasket');

module.exports = {
  plugins: [
    chasketPlugin({
      target: 'js',      // 'js' | 'ts'
      optimize: false,
    }),
  ],
};
```

`.csk` ファイルの自動コンパイルと Vite HMR 統合を提供します。
