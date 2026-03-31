# Chasket — ES Module & TypeScript サポート

## 概要

Chasket v0.2.2 より、`.csk` コンポーネントから外部の TypeScript / JavaScript ファイルを `import` できるようになりました。これにより、ロジックの分離・再利用が可能になります。

---

## 基本構成

```
my-project/
├── chasket.config.json
├── package.json
├── src/
│   ├── components/
│   │   ├── my-counter.csk
│   │   └── my-header.csk
│   ├── lib/
│   │   ├── reactive.ts      ← TS ライブラリ
│   │   └── utils.ts
│   └── index.html
└── dist/                     ← ビルド出力
    ├── chasket-bundle.js
    ├── components/
    │   ├── my-counter.js
    │   └── my-header.js
    └── lib/
        ├── reactive.js       ← 自動トランスパイル
        └── utils.js
```

---

## 1. Module を使う場合（import あり）

### .csk ファイルでの書き方

```html
<meta>
  name: my-counter
</meta>

<script>
  import ReactiveNode from '../lib/reactive';
  import { formatDate } from '../lib/utils';

  const node = ReactiveNode.createReacterNode();
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <div>
    <span>{{ count }}</span>
    <button @click="increment">+1</button>
  </div>
</template>
```

### ビルド出力の特徴

`import` 文がある場合、コンパイラは自動的に以下の動作をします。

- IIFE ラッパー `(() => { ... })()` を省略し、ES Module 形式で出力
- `import` の `.ts` / `.tsx` 拡張子は自動的に `.js` に書き換え
- ES Module は仕様上 strict mode なので `"use strict"` も省略

出力例:

```javascript
/* Built with Chasket v0.2.2 */
import ReactiveNode from '../lib/reactive.js';

class MyCounter extends HTMLElement {
  // ...
}

customElements.define('my-counter', MyCounter);
```

### HTML での読み込み

`import` を含むバンドルは `type="module"` が必須です。

```html
<script type="module" src="dist/chasket-bundle.js"></script>
```

### TypeScript ファイルの自動トランスパイル

`src/` 内の `.ts` ファイル（`components/` 以外）は、ビルド時に自動的に型注釈を除去して `dist/` に `.js` として出力されます。

対応する型除去:

- 型注釈（`x: string`、`: ReturnType`）
- `interface` / `type` 宣言
- `enum` 宣言
- ジェネリクス（`<T>`、`Set<Type>()`）
- `as` キャスト / 非 null アサーション（`!`）
- `public` / `private` / `protected` / `readonly`
- TypeScript の `this` パラメータ
- `import type` / `export type`

複雑な TypeScript を使う場合は、`tsc` や `esbuild` での事前コンパイルを推奨します。

---

## 2. Module を使わない場合（import なし）

`import` 文がなく、`--target ts` も指定しない場合は、従来通り IIFE ラッパー付きで出力されます。

```html
<script>
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <button @click="increment">{{ count }}</button>
</template>
```

出力:

```javascript
/* Built with Chasket v0.2.2 */
(() => {
"use strict";

class MyCounter extends HTMLElement {
  // ...
}

customElements.define('my-counter', MyCounter);
})();
```

この場合は通常の `<script>` タグで読み込めます。

```html
<script src="dist/chasket-bundle.js"></script>
```

---

## 3. TypeScript 出力（--target ts）

`--target ts` を指定すると、個別コンポーネントが `.ts` ファイルとして型注釈付きで出力されます。

```bash
chasket build --target ts
```

もしくは `chasket.config.json` で:

```json
{
  "target": "ts"
}
```

バンドル（`chasket-bundle.js`）は常に JavaScript（型なし）で出力されます。ブラウザで直接実行するためです。

---

## 4. chasket.config.json の設定

```json
{
  "src": "src",
  "outdir": "dist",
  "bundle": "chasket-bundle.js",
  "target": "js",
  "shadow": "open"
}
```

| キー | 説明 | デフォルト |
|------|------|-----------|
| `src` | ソースディレクトリ。`.csk` と `.ts` を再帰探索 | `src/components` |
| `outdir` | ビルド出力先 | `dist` |
| `bundle` | バンドルファイル名 | `chasket-bundle.js` |
| `target` | 個別出力形式: `js` または `ts` | `js` |
| `shadow` | Shadow DOM モード: `open` / `closed` / `none` | `open` |

### src の指定パターン

`src` の値によってディレクトリ構造が変わります。

**`"src": "src/components"` の場合（従来の構成）:**

```
src/components/my-counter.csk → dist/components/my-counter.js
```

TS トランスパイルは `src/`（`components/` の親）を探索するので `src/lib/` 等も含まれます。

**`"src": "src"` の場合（柔軟な構成）:**

```
src/components/my-counter.csk → dist/components/my-counter.js
src/lib/reactive.ts           → dist/lib/reactive.js
```

ディレクトリ構造がそのまま `dist/` に反映されます。

---

## 5. dev サーバーでの TypeScript

`chasket dev` でローカルサーバーを起動した場合、`.ts` ファイルはオンザフライでトランスパイルされます。

ブラウザが `.js` ファイルをリクエストし、対応する `.js` が存在しない場合、同名の `.ts` ファイルを探して型除去した JavaScript を返します。ファイルを保存するだけで即座に反映されます。

---

## 6. import のルール

### 対応する import 形式

```javascript
// デフォルト import
import ReactiveNode from '../lib/reactive';

// 名前付き import
import { formatDate, parseJSON } from '../lib/utils';

// デフォルト + 名前付き
import ReactiveNode, { Signal } from '../lib/reactive';

// 名前空間 import
import * as Utils from '../lib/utils';

// 副作用 import
import '../lib/polyfill';

// 型のみ import（--target ts のとき出力、JS では除去）
import type { NodeType } from '../lib/types';
```

### パス解決

- 相対パス（`./` / `../`）のみ解決・書き換えされます
- `.ts` / `.tsx` 拡張子は自動的に `.js` に変換されます
- 拡張子なしの場合は `.js` が付与されます
- npm パッケージ名（bare specifier: `'react'`）はそのまま通されます

### バンドル時の動作

バンドル生成時、各コンポーネントの `import` は以下のように処理されます。

- バンドル内の他コンポーネントへの import → 自動除去（バンドル内で自己完結）
- 外部ファイルへの import → バンドルファイル位置からの相対パスに自動書き換え
- import 文はバンドル先頭に巻き上げ・重複除去

---

## 7. セキュリティ考慮事項

- import パスのパストラバーサル防止: ソースルート外への `../` は書き換え対象外
- ReDoS 対策: `stripTypes` の正規表現に量指定子上限（200文字）を設定
- dev サーバーの TS 配信はプロジェクト内ファイルのみ（`allowedRoots` チェック）
- バンドル内の import は bare specifier を改変しない（npm パッケージ名の安全な通過）
