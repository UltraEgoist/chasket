# @aspect/chasket-ui API Reference

Chasket で構築されたリユーザブル UI コンポーネントライブラリ。全コンポーネントが Web Components として動作し、Shadow DOM でスタイルをカプセル化しています。

## Installation

```bash
npm install @aspect/chasket-ui
```

```html
<!-- バンドル版（全コンポーネント） -->
<script src="node_modules/@aspect/chasket-ui/dist/chasket-ui.js"></script>

<!-- 個別コンポーネント -->
<script src="node_modules/@aspect/chasket-ui/dist/fl-button.js"></script>
```

---

## Components

### `<fl-button>`

多バリアント対応のボタンコンポーネント。ローディング状態のスピナーアニメーション付き。

```html
<fl-button>Click me</fl-button>
<fl-button variant="danger" size="lg">Delete</fl-button>
<fl-button loading>Saving...</fl-button>
<fl-button disabled>Disabled</fl-button>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"primary" \| "secondary" \| "danger" \| "ghost"` | `"primary"` | ボタンのスタイルバリアント |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | ボタンのサイズ |
| `disabled` | `boolean` | `false` | 無効状態 |
| `loading` | `boolean` | `false` | ローディング状態（スピナー表示） |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `press` | `void` | ボタンがクリックされた（disabled/loading 時は発火しない） |

**Slots:** `default` — ボタンのラベルテキスト

---

### `<fl-input>`

フォーム連携対応のテキスト入力コンポーネント。ラベル、バリデーション、プレフィックス/サフィックススロットをサポート。

```html
<fl-input label="Email" placeholder="you@example.com" required></fl-input>
<fl-input label="Name" value="Alice" hint="Your display name"></fl-input>
<fl-input label="Password" error="8文字以上必要です"></fl-input>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | `""` | 入力フィールドのラベル |
| `placeholder` | `string` | `""` | プレースホルダーテキスト |
| `value` | `string` | `""` | 入力値 |
| `disabled` | `boolean` | `false` | 無効状態 |
| `required` | `boolean` | `false` | 必須フィールド（* マーク付き） |
| `error` | `string` | `""` | エラーメッセージ（赤色で表示） |
| `hint` | `string` | `""` | ヒントテキスト（グレーで表示） |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `input` | `string` | 入力値が変更された（リアルタイム） |
| `change` | `string` | 入力値が確定した（blur 時） |

**Slots:**

| Slot | Description |
|------|-------------|
| `prefix` | 入力フィールドの左側に配置する要素（アイコンなど） |
| `suffix` | 入力フィールドの右側に配置する要素 |

**Form Association:** `<form>` 要素と連携し、`setFormValue()` / `setValidity()` を自動的に呼び出します。`formReset` イベントで値がクリアされます。

---

### `<fl-card>`

コンテンツカードコンポーネント。ヘッダー/フッタースロット、3つのバリアント、クリッカブルモード対応。

```html
<fl-card>
  <span slot="header">Card Title</span>
  <p>Card content goes here.</p>
  <span slot="footer">Footer</span>
</fl-card>

<fl-card variant="outlined" clickable>
  <p>Click this card</p>
</fl-card>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"elevated" \| "outlined" \| "flat"` | `"elevated"` | カードスタイル |
| `padding` | `"none" \| "sm" \| "md" \| "lg"` | `"md"` | 内部パディング |
| `clickable` | `boolean` | `false` | クリック可能（カーソル変更 + イベント発火） |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `press` | `void` | カードがクリックされた（`clickable` 時のみ） |

**Slots:**

| Slot | Description |
|------|-------------|
| `default` | カードの本文 |
| `header` | ヘッダー領域 |
| `footer` | フッター領域 |

---

### `<fl-dialog>`

モーダルダイアログ。バックドロップ、ARIA dialog ロール、サイズバリアント対応。

```html
<fl-dialog open title="Confirm" closable>
  <p>Are you sure?</p>
</fl-dialog>
```

```javascript
const dialog = document.querySelector('fl-dialog');
dialog.open = true;  // 開く
dialog.open = false; // 閉じる
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `false` | ダイアログの表示状態 |
| `title` | `string` | `""` | ダイアログタイトル |
| `closable` | `boolean` | `true` | 閉じるボタン/バックドロップクリックを許可 |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | ダイアログのサイズ |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `close` | `void` | ダイアログが閉じられた |

**Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` を自動設定。

---

### `<fl-badge>`

ステータスバッジ。5色バリアント、ピル型、ドットインジケーター対応。

```html
<fl-badge>Default</fl-badge>
<fl-badge variant="success">Active</fl-badge>
<fl-badge variant="danger" pill>3</fl-badge>
<fl-badge variant="warning" dot>Pending</fl-badge>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"default" \| "primary" \| "success" \| "warning" \| "danger"` | `"default"` | バッジの色 |
| `size` | `"sm" \| "md"` | `"md"` | バッジのサイズ |
| `pill` | `boolean` | `false` | 完全に丸い形状 |
| `dot` | `boolean` | `false` | ドットインジケーター表示 |

**Slots:** `default` — バッジのテキスト

---

### `<fl-alert>`

通知/アラートコンポーネント。4バリアント、dismiss（閉じる）機能付き。

```html
<fl-alert variant="success" title="Success">Operation completed.</fl-alert>
<fl-alert variant="error" dismissible>Something went wrong.</fl-alert>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"info" \| "success" \| "warning" \| "error"` | `"info"` | アラートの種類 |
| `dismissible` | `boolean` | `false` | 閉じるボタンを表示 |
| `title` | `string` | `""` | アラートタイトル（太字表示） |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `dismiss` | `void` | アラートが閉じられた |

**Accessibility:** `role="alert"` を自動設定。

---

### `<fl-tabs>`

タブナビゲーション。line / pill バリアント、ARIA tablist 対応。

```html
<fl-tabs items="Home, Profile, Settings" active="Home" variant="line"></fl-tabs>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `string` | `""` | カンマ区切りのタブ名一覧 |
| `active` | `string` | `""` | 初期選択タブ名 |
| `variant` | `"line" \| "pill"` | `"line"` | タブのスタイル |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `change` | `string` | 選択されたタブ名 |

**Computed:** `tabList` — `items` 文字列をパースした配列

**Accessibility:** `role="tablist"`, `role="tab"`, `aria-selected` を自動設定。

---

### `<fl-spinner>`

SVG ベースのローディングスピナー。色・サイズカスタマイズ可能。

```html
<fl-spinner></fl-spinner>
<fl-spinner size="lg" color="#ef4444" label="読み込み中"></fl-spinner>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | スピナーのサイズ |
| `color` | `string` | `"#3b82f6"` | スピナーの色（CSS カラー値） |
| `label` | `string` | `"Loading"` | スクリーンリーダー向けラベル |

**Accessibility:** `role="status"`, `aria-label` を自動設定。

---

### `<fl-toggle>`

フォーム連携対応のトグルスイッチ。

```html
<fl-toggle label="Enable notifications"></fl-toggle>
<fl-toggle checked disabled label="Active"></fl-toggle>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | `false` | トグルの ON/OFF 状態 |
| `disabled` | `boolean` | `false` | 無効状態 |
| `label` | `string` | `""` | ラベルテキスト |
| `size` | `"sm" \| "md"` | `"md"` | トグルのサイズ |

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `change` | `boolean` | トグルの新しい状態 |

**Form Association:** `setFormValue("on")` (checked) / `setFormValue("")` (unchecked)。`formReset` で unchecked に戻ります。

**Accessibility:** `role="switch"`, `aria-checked` を自動設定。

---

## Styling

全コンポーネントは Shadow DOM を使用しているため、外部の CSS は直接適用できません。以下の方法でカスタマイズ可能です。

### CSS Custom Properties (将来対応予定)

```css
fl-button {
  --fl-button-bg: #8b5cf6;
  --fl-button-radius: 12px;
}
```

### CSS Parts (一部コンポーネント)

```css
fl-link::part(link) {
  color: #3b82f6;
}
```

### Host Styling

```css
fl-button {
  display: block;
  margin: 8px 0;
}
```
