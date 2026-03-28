# コンポーネント構文

Chasket コンポーネントの `<script>` ブロックで使用できる宣言とテンプレート構文の詳細です。

## State（状態）

コンポーネント内部の状態を宣言します。変更するとDOMが自動更新されます。

```chasket
<script>
  state count: number = 0
  state name: string = "Chasket"
  state items: string[] = ["a", "b", "c"]
  state config: { theme: string, size: number } = { theme: "dark", size: 16 }
</script>
```

## Prop（プロパティ）

外部からHTML属性で渡される値です。`observedAttributes` に自動登録されます。

```chasket
<script>
  prop title: string = "Default Title"
  prop count: number = 0
  prop disabled: boolean = false
</script>
```

HTML側での使用:

```html
<my-component title="Hello" count="5" disabled></my-component>
```

## Computed（算出値）

他の state/prop から自動計算される値です。

```chasket
<script>
  state price: number = 100
  state tax: number = 0.1
  computed total: number = price * (1 + tax)
  computed label: string = `合計: ${total}円`
</script>
```

## Fn（関数）

イベントハンドラやロジックを定義します。

```chasket
<script>
  state count: number = 0
  fn increment() { count++ }
  fn decrement() { count-- }
  fn reset() { count = 0 }
  fn addAmount(n: number) { count += n }
</script>
```

## Emit（カスタムイベント）

親コンポーネントに通知するカスタムイベントを定義します。

```chasket
<script>
  emit clicked: { x: number, y: number }
  emit changed: { value: string }
</script>
```

テンプレート内では `$emit` で発火:

```chasket
<template>
  <button @click="$emit('clicked', { x: 10, y: 20 })">Click</button>
</template>
```

## Watch（監視）

state の変更を監視して副作用を実行します。

```chasket
<script>
  state query: string = ""
  watch query -> { console.log('Query changed:', query) }
</script>
```

## Provide / Consume（コンテキスト）

親コンポーネントから子孫に値を共有します。CustomEvent でバブリングします。

```chasket
// 親コンポーネント
<script>
  provide theme: string = "dark"
</script>
```

```chasket
// 子孫コンポーネント
<script>
  consume theme: string
  consume theme: string from x-app  // 特定のプロバイダーを指定
</script>
```

provide の値が変更されると、consume 側もリアクティブに更新されます。

## Import

外部モジュールをインポートします。

```chasket
<script>
  import { format } from "date-fns"
  import { format as fmt } from "date-fns"
  import type { User } from "./types"
  import * as utils from "./utils"
</script>
```

- `.ts` / `.csk` 拡張子は自動的に `.js` に書き換えられます
- `import type` は JS 出力では除去、TS 出力では保持されます

---

## テンプレート構文

### インターポレーション

```chasket
<template>
  <p>{{ message }}</p>
  <p>{{ count * 2 }}</p>
  <p>{{ items.length > 0 ? 'あり' : 'なし' }}</p>
</template>
```

すべての出力は自動的にHTMLエスケープされます（XSS防止）。

### 条件分岐

```chasket
<template>
  <#if cond="isLoggedIn">
    <p>Welcome, {{ name }}!</p>
  <:else-if cond="isLoading">
    <p>Loading...</p>
  <:else>
    <p>Please log in.</p>
  </#if>
</template>
```

### ループ

```chasket
<template>
  <#for each="item" of="items" key="item.id">
    <div>{{ item.name }}</div>
  <:empty>
    <p>No items found.</p>
  </#for>
</template>
```

`key` 属性で効率的な差分更新が行われます。`:empty` で配列が空の場合の表示を定義できます。

### イベントバインディング

```chasket
<template>
  <button @click="handleClick">Click</button>
  <form @submit|prevent="handleSubmit">...</form>
  <input @keydown|enter="search">
  <div @click|stop|prevent="handler">...</div>
</template>
```

修飾子: `prevent`, `stop`, `once`, `self`, `enter`, `escape`

### 動的属性

```chasket
<template>
  <div :class="isActive ? 'active' : ''">...</div>
  <img :src="imageUrl" :alt="description">
  <a :href="link">...</a>
  <input :disabled="isDisabled">
</template>
```

`:href` と `:src` は自動的に `javascript:` / `data:` URLをブロックします。

### 双方向バインディング

```chasket
<template>
  <input :bind="name" placeholder="Enter name">
  <textarea :bind="description"></textarea>
</template>
```

### Slot

```chasket
<template>
  <div class="card">
    <slot></slot>
    <slot name="footer"></slot>
  </div>
</template>
```

### @html ディレクティブ

```chasket
<template>
  <div @html="rawHtml"></div>
</template>
```

> **Warning:** `@html` はエスケープをバイパスします。ユーザー入力を直接渡さないでください。

---

## Shadow DOM モード

### `shadow: open`

```chasket
<meta>
  name: "my-component"
  shadow: open
</meta>
```

標準の Shadow DOM。スタイルが完全にカプセル化されます。

### `shadow: closed`

外部から `shadowRoot` にアクセスできません。

### `shadow: none`

Shadow DOM を使用せず、`data-chasket-scope` 属性による CSS スコーピングを行います。既存CSSとの統合が容易です。
