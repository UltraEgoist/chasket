# Getting Started / はじめに

This guide walks through creating your first Web Component with Chasket and running it in the browser.

このガイドでは、Chasket を使って最初の Web Component を作成し、ブラウザで動かすまでの手順を説明します。

---

## Prerequisites / 前提条件

- **Node.js 18+** installed / インストール済み
- Terminal access / ターミナルが使えること

```bash
node --version   # v18.0.0+
```

---

## 1. Create a Project / プロジェクトの作成

### Recommended: `npm create chasket` (推奨)

```bash
npm create chasket
```

The interactive setup will ask you to:
1. Enter a project name
2. Choose a template: **minimal** (counter), **todo-app**, or **spa**

対話型セットアップで以下を選択します：
1. プロジェクト名を入力
2. テンプレートを選択: **minimal**（カウンター）、**todo-app**、**spa**

```bash
cd my-app
npm install
```

### Alternative: `npx` / 別の方法

```bash
npx @chasket/chasket init my-app
cd my-app
npm install
```

### Generated Structure / 生成される構造

The **minimal** template creates:

```
my-app/
├── src/
│   ├── app.csk              # Main component / メインコンポーネント
│   └── lib/
│       └── utils.ts          # TypeScript utility / ユーティリティ
├── index.html                # Entry point / エントリーポイント
├── chasket.config.json       # Config / 設定ファイル
└── package.json
```

---

## 2. Run the Dev Server / 開発サーバーを起動

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The page auto-reloads when you edit `.csk` files.

ブラウザで `http://localhost:3000` を開きます。`.csk` ファイルを編集するとリアルタイムで更新されます。

---

## 3. Write a Component / コンポーネントを書く

A `.csk` file has 4 blocks:

`.csk` ファイルは 4 つのブロックで構成されます：

| Block | Purpose / 役割 |
|-------|-----------------|
| `<meta>` | Component name, Shadow DOM mode / コンポーネント名、Shadow DOM モード |
| `<script>` | Reactive state, methods, lifecycle / 状態、メソッド、ライフサイクル |
| `<template>` | HTML template with `{{ }}` bindings / HTML テンプレート |
| `<style>` | Scoped CSS (Shadow DOM) / スコープ付き CSS |

```chasket
<meta>
  name: "hello-world"
  shadow: open
</meta>

<script>
  state name: string = "World"

  fn handleInput(e) {
    name = e.target.value
  }
</script>

<template>
  <div class="container">
    <h1>Hello, {{ name }}!</h1>
    <input :value="name" @input="handleInput" />
  </div>
</template>

<style>
  :host { display: block; font-family: system-ui, sans-serif; }
  .container { max-width: 400px; margin: 2rem auto; text-align: center; }
  h1 { color: #3b82f6; }
  input { width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 8px; }
  input:focus { border-color: #3b82f6; outline: none; }
</style>
```

---

## 4. Core Syntax / 基本構文

### Reactive `state` / リアクティブ変数

```chasket
<script>
  state count: number = 0
  fn increment() { count += 1 }
</script>
<template>
  <p>{{ count }}</p>
  <button @click="increment">+1</button>
</template>
```

### External attributes `prop` / 外部属性

```chasket
<script>
  prop label: string = "Click me"
  prop variant: string = "primary"
</script>
<template>
  <button :class="variant">{{ label }}</button>
</template>
```

```html
<my-button label="Submit" variant="primary"></my-button>
```

### Computed properties / 算出プロパティ

```chasket
<script>
  state items: string[] = []
  computed total: number = items.length
  computed isEmpty: boolean = items.length === 0
</script>
```

### Conditionals `<#if>` / 条件分岐

```chasket
<template>
  <#if condition="count > 0">
    <p>{{ count }} items</p>
  <:else-if condition="loading">
    <p>Loading...</p>
  <:else>
    <p>No items</p>
  </#if>
</template>
```

### Loops `<#for>` / ループ

```chasket
<template>
  <ul>
    <#for each="item, index" of="items" key="item.id">
      <li>{{ index + 1 }}. {{ item.name }}</li>
    <:empty>
      <li>Empty list</li>
    </#for>
  </ul>
</template>
```

### Events / イベント処理

```chasket
<template>
  <button @click="handleClick">Click</button>
  <form @submit|prevent="handleSubmit">...</form>
</template>
```

| Modifier | Effect |
|----------|--------|
| `\|prevent` | `event.preventDefault()` |
| `\|stop` | `event.stopPropagation()` |
| `\|once` | Fire once only / 一度だけ発火 |
| `\|self` | Only if `target === currentTarget` |
| `\|enter` | Enter key only |
| `\|escape` | Escape key only |

### Two-way binding `:bind` / 双方向バインディング

```chasket
<script>
  state text: string = ""
</script>
<template>
  <input :bind="text" />
  <p>Input: {{ text }}</p>
</template>
```

### ES Module imports (v0.3+) / ES Module インポート

```chasket
<script>
  import { createStore } from '../lib/store';
  const store = createStore();
  state count: number = 0
</script>
```

---

## 5. Component Composition / コンポーネントの合成

Chasket components work as standard HTML tags. No import needed.

Chasket コンポーネントは通常の HTML タグとして使えます。import 不要です。

```chasket
<!-- task-item.csk -->
<meta>
  name: "task-item"
  shadow: open
</meta>
<script>
  prop label: string = ""
  prop done: boolean = false
  emit toggle: void
</script>
<template>
  <div :class="done ? 'done' : ''">
    <button @click="$emit('toggle')">
      <#if condition="done">done<:else>pending</#if>
    </button>
    <span>{{ label }}</span>
  </div>
</template>
```

The bundle registers all components before any `connectedCallback` fires, so nesting works regardless of file order.

バンドルは全コンポーネントを一括登録するため、ファイル順に関わらずネストが正しく動作します。

---

## 6. Production Build / 本番ビルド

```bash
npm run build
```

Output:

```
dist/
├── chasket-bundle.js       # All components bundled / 全コンポーネントバンドル
├── lib/                    # Transpiled TypeScript / トランスパイル済み TS
└── components/             # Individual files / 個別ファイル
```

```html
<!DOCTYPE html>
<html>
<head><title>My App</title></head>
<body>
  <my-app></my-app>
  <script type="module" src="dist/chasket-bundle.js"></script>
</body>
</html>
```

---

## 7. Editor Support / エディタサポート

### VS Code

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) or search "Chasket" in Extensions.

VS Code の拡張機能パネルで「Chasket」を検索するか、[Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) からインストール。

### Neovim / Sublime / Emacs / Helix

```bash
npx chasket-lsp --stdio
```

See [LSP API docs](api/chasket-lsp.md) for editor-specific setup.

---

## 8. Type Checking / 型チェック

```bash
npx @chasket/chasket check
```

Detects: undefined variables, type mismatches, undeclared prop usage, invalid template references.

検出対象: 未定義変数、型不一致、未宣言 prop、テンプレート内の無効な参照。

Supported types: `string`, `number`, `boolean`, `void`, `any`, `string[]`, `number[]`, `Array<T>`, `Map<K,V>`, `Set<T>`, `Record<K,V>`, `HTMLElement` and subtypes.

---

## Troubleshooting / トラブルシューティング

**Event handlers cannot use string literals** — Use named functions instead of inline expressions:

```chasket
<!-- Bad -->
<button @click="setFilter('all')">All</button>

<!-- Good -->
<script>
  fn setFilterAll() { filter = "all" }
</script>
<template>
  <button @click="setFilterAll">All</button>
</template>
```

**External CSS has no effect inside Shadow DOM** — Components with `shadow: open` isolate styles. Define styles in the component's `<style>` block.

**Component not rendering** — Check: (1) `<meta>` `name` contains a hyphen, (2) HTML tag matches `name`, (3) `dist/chasket-bundle.js` is loaded.

---

## Next Steps / 次のステップ

- [API Reference / API リファレンス](API.md)
- [ES Module & TypeScript Guide](module-and-typescript.md)
- [SSR Guide / SSR ガイド](api/chasket-ssr.md)
- [LSP Guide / LSP ガイド](api/chasket-lsp.md)
- [Learning Guide / 技術学習ガイド](LEARNING_GUIDE.md)
- [Roadmap / ロードマップ](ROADMAP.md)
