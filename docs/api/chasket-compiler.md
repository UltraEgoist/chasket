# Chasket Compiler API Reference

`.csk` ファイルを Web Components にコンパイルするコアコンパイラ。5フェーズのパイプラインで処理します。

## Installation

```bash
npm install @chasket/chasket
```

## compile(source, fileName, options?)

メインのコンパイル関数。`.csk` ソースを受け取り、Web Component の JavaScript コードを出力します。

```javascript
const { compile } = require('@chasket/chasket');

const result = compile(source, 'my-component.csk', {
  target: 'js',
  optimize: false,
});
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | `string` | (required) | `.csk` ファイルの内容 |
| `fileName` | `string` | (required) | ファイル名（コンポーネント名の自動推定に使用） |
| `options.target` | `'js' \| 'ts'` | `'js'` | 出力ターゲット |
| `options.optimize` | `boolean` | `false` | Tree-shaking 最適化 |
| `options.componentRegistry` | `Map` | - | 自動インポート用コンポーネント登録マップ |

### Returns: `CompileResult`

```typescript
interface CompileResult {
  success: boolean;            // コンパイル成功かどうか
  output?: string;             // 生成された JavaScript コード
  dtsOutput?: string;          // TypeScript 型定義（.d.ts）
  diagnostics: Diagnostic[];   // エラー・警告の配列
  sourceMap?: object;          // ソースマップ
  meta?: {                     // コンポーネントメタデータ
    name: string;
    shadow: string;
    form: boolean;
  };
}

interface Diagnostic {
  level: 'error' | 'warning';
  code: string;                // 例: 'E0001', 'W0201'
  message: string;
  hint?: string;               // 修正提案
  line?: number;               // ソース行番号
}
```

---

## .csk File Structure

Chasket コンポーネントは4つのブロックで構成されます。

```html
<meta>
name: my-counter
shadow: open
</meta>

<script>
state count: number = 0

fn increment() {
  count = count + 1
}
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <button @click="increment">+1</button>
  </div>
</template>

<style>
p { font-size: 1.2rem; }
button { padding: 0.5rem 1rem; }
</style>
```

---

## Meta Block

コンポーネントのメタデータを定義します。

```
<meta>
name: my-component
shadow: open
form: true
generic: T extends string, U = number
</meta>
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | (ファイル名から自動生成) | Custom Element のタグ名（ハイフン必須） |
| `shadow` | `'open' \| 'closed' \| 'none'` | `'open'` | Shadow DOM モード |
| `form` | `boolean` | `false` | Form-Associated Custom Element として登録 |
| `generic` | `string` | - | ジェネリック型パラメータ（カンマ区切り） |

### Generic Syntax

```
generic: T
generic: T extends string
generic: T extends Comparable = string
generic: K extends string, V = any
```

---

## Script Block

### Declarations

#### `state` — リアクティブな内部状態

```
state count: number = 0
state items: string[] = []
state user: { name: string, age: number } = { name: "", age: 0 }
```

変更時に自動的にテンプレートを再レンダリングします。

#### `prop` — 外部から受け取るプロパティ

```
prop title: string = "Default Title"
prop size: "sm" | "md" | "lg" = "md"
prop disabled: boolean = false
prop items: Array<string> = []
```

HTML 属性経由で値を渡せます。型に応じた自動変換（string → number/boolean）が行われます。

#### `computed` — 派生値

```
computed doubled: number = count * 2
computed fullName: string = firstName + " " + lastName
```

依存する state/prop が変更されると自動再計算されます。

#### `emit` — イベント宣言

```
emit change: string
emit submit: { name: string, email: string }
emit close: void
```

宣言後、関数として呼び出すと `CustomEvent` が dispatch されます。

```
fn handleClick() {
  change("new value")  // CustomEvent { detail: "new value" } を発火
}
```

#### `ref` — DOM 要素参照

```
ref inputEl: HTMLInputElement
ref canvas: HTMLCanvasElement
```

テンプレート内で `ref="inputEl"` を使用して要素を参照します。

#### `fn` — メソッド定義

```
fn increment() {
  count = count + 1
}

fn add(amount) {
  count = count + amount
}

fn fetchData() {
  // 複数行の処理
  const res = fetch('/api/data')
  items = res.json()
}
```

#### `watch` — 値の変更監視

```
watch(count) {
  console.log("count changed to", count)
}

watch(user.name) {
  validateName(user.name)
}
```

#### `provide` / `consume` — コンテキスト共有

```
// 親コンポーネント
provide theme: string = "dark"

// 子コンポーネント
consume theme: string
```

#### Lifecycle Hooks

```
on mount {
  console.log("Component mounted")
  fetchData()
}

on unmount {
  cleanup()
}

on adopt {
  // adoptedCallback — ドキュメント間の移動時
}

on formReset {
  // Form-Associated: フォームリセット時
  value = ""
  setFormValue("")
}
```

#### `import` — モジュールインポート

```
import { format } from "date-fns"
import utils from "./utils.js"
import * as d3 from "d3"
import "./side-effect.js"
```

#### `type` — 型エイリアス

```
type Status = "active" | "inactive" | "pending"
type User = { name: string, email: string, age?: number }
```

---

## Template Syntax

### Interpolation

```html
<p>{{ count }}</p>
<p>{{ user.name }}</p>
<p>{{ count * 2 + 1 }}</p>
```

### Dynamic Attributes

```html
<div :class="['active', isOpen ? 'open' : '']"></div>
<input :value="name" :disabled="isLocked" />
<img :src="imageUrl" :alt="imageDesc" />
```

### Event Binding

```html
<button @click="handleClick">Click</button>
<input @input="handleInput" @blur="handleBlur" />
<form @submit="handleSubmit" />
```

### Conditional Rendering

```html
<#if condition="isLoggedIn">
  <p>Welcome, {{ userName }}!</p>
<:else>
  <p>Please log in.</p>
</#if>

<#if condition="status === 'error'">
  <p class="error">{{ errorMessage }}</p>
<:else-if condition="status === 'loading'">
  <fl-spinner></fl-spinner>
<:else>
  <p>{{ data }}</p>
</#if>
```

**重要:** `condition` 属性に式を指定する必要があります。`<#if expr>` のショートハンド構文は使用できません。

### Loop Rendering

```html
<#for each="item" of="items">
  <li>{{ item }}</li>
</#for>

<#for each="user" of="users">
  <div class="user-card">
    <h3>{{ user.name }}</h3>
    <p>{{ user.email }}</p>
  </div>
<:empty>
  <p>No users found.</p>
</#for>
```

### Two-way Binding

```html
<input :bind="name" />
<!-- 等価: :value="name" @input="e => name = e.target.value" -->
```

### Slots

```html
<!-- コンポーネント定義 -->
<template>
  <div class="card">
    <slot name="header"></slot>
    <slot></slot>
    <slot name="footer"></slot>
  </div>
</template>

<!-- 使用側 -->
<my-card>
  <span slot="header">Title</span>
  <p>Body content</p>
  <span slot="footer">Footer</span>
</my-card>
```

---

## Type System

Chasket コンパイラはコンパイル時の型チェックを行います。

### Supported Types

| Type | Example |
|------|---------|
| Primitive | `string`, `number`, `boolean`, `void`, `null`, `undefined` |
| Array | `string[]`, `number[][]` |
| Union | `string \| number`, `"a" \| "b" \| "c"` |
| Literal | `"primary"`, `"secondary"` |
| Object | `{ name: string, age: number, email?: string }` |
| Generic | `Array<string>`, `Map<string, number>`, `Promise<T>` |

### Diagnostic Codes

| Code | Level | Description |
|------|-------|-------------|
| E0001 | Error | `<template>` ブロックが見つからない |
| E0003 | Error | 不正なコンポーネント名（ハイフン必須、小文字のみ） |
| E0201 | Error | 型チェックエラー（型の不一致） |
| E0301 | Error | 未定義の変数が参照された |
| E0401 | Error | イベントハンドラに危険なコードが含まれている |
| W0201 | Warning | 型の互換性に関する警告 |

---

## ES Module Output (v0.3.0)

コンポーネントの `<script>` ブロックに `import` 文が含まれる場合、コンパイラは自動的に ES Module 形式で出力します。

### 出力モードの自動判定

| 条件 | 出力形式 | `<script>` タグ |
|------|---------|----------------|
| `import` なし、`target: 'js'` | IIFE ラッパー付き | `<script src="...">` |
| `import` あり | ES Module（IIFE なし） | `<script type="module" src="...">` |
| `target: 'ts'` | ES Module + 型注釈 + export | `<script type="module" src="...">` |

### ES Module 出力の特徴

- IIFE ラッパー `(() => { ... })()` を省略
- `import` の `.ts` / `.tsx` 拡張子は自動的に `.js` に書き換え
- ES Module は仕様上 strict mode なので `"use strict"` も省略
- `target: 'ts'` の場合、`export default` と `export {}` を付与

### バンドル時の import 処理

バンドル生成時、各コンポーネントの `import` は以下のように処理されます。

- バンドル内の他コンポーネントへの import → 自動除去（バンドル内で自己完結）
- 外部ファイルへの import → バンドルファイル位置からの相対パスに自動書き換え
- import 文はバンドル先頭に巻き上げ・重複除去
- bare specifier（npm パッケージ名）はそのまま通過

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

### パス解決ルール

- 相対パス（`./` / `../`）のみ解決・書き換え
- `.ts` / `.tsx` 拡張子は自動的に `.js` に変換
- 拡張子なしの場合は `.js` が付与
- bare specifier（`'react'` 等）はそのまま通過

---

## TypeScript トランスパイル (v0.3.0)

`src/` 内の `.ts` ファイル（`components/` 配下・`.d.ts` を除く）はビルド時に自動的に型注釈を除去して `dist/` に `.js` として出力されます。

### 対応する型除去

- 型注釈（`x: string`、`: ReturnType<T>`）
- `interface` / `type` 宣言
- `enum` 宣言
- ジェネリクス（`<T>`、`Set<Type>()`、アロー関数 `<T>() =>`）
- `as` キャスト / 非 null アサーション（`!`）
- `public` / `private` / `protected` / `readonly`
- TypeScript の `this` パラメータ
- `import type` / `export type`
- 型のみのクラスフィールド宣言

### dev サーバーでの TypeScript

`chasket dev` 実行時、`.ts` ファイルはオンザフライでトランスパイルされます。ブラウザが `.js` をリクエストし、対応する `.js` が存在しない場合、同名の `.ts` を探して型除去した JavaScript を返します。

---

## セキュリティ

### import パスのバリデーション

- ソースルート外への `../` パストラバーサルを防止
- bare specifier（npm パッケージ名）は改変しない
- プロジェクト内ファイルのみアクセス可能（`allowedRoots` チェック）

### ReDoS 対策

`stripTypes` の正規表現にはすべて量指定子上限（`{0,200}`）を設定し、悪意ある入力によるバックトラッキング攻撃を防止しています。

---

## CLI Commands

```bash
# 新規プロジェクト生成
chasket init my-app

# 開発サーバー起動（ファイル監視 + HMR）
chasket dev

# 本番ビルド
chasket build

# 型チェックのみ（出力なし）
chasket check
```

### chasket.config.json

```json
{
  "src": "src",
  "out": "dist",
  "target": "js",
  "optimize": false,
  "sourceMap": true,
  "html": "src/index.html"
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `src` | `string` | `"src"` | ソースディレクトリ |
| `out` | `string` | `"dist"` | 出力ディレクトリ |
| `target` | `'js' \| 'ts'` | `"js"` | 出力ターゲット |
| `optimize` | `boolean` | `false` | 最適化フラグ |
| `sourceMap` | `boolean` | `true` | ソースマップ生成 |
| `html` | `string` | - | HTML エントリポイント |
