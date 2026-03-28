# Chasket 🔥

テンプレートファーストのコンパイル型言語。ネイティブWeb Componentにコンパイルします。

シンプルな `.csk` ファイルを書くだけで、ゼロランタイムのCustom Elements（Shadow DOM・スコープ付きCSS・リアクティビティ・型チェック付き）が手に入ります。

```chasket
<meta>
  name: "x-counter"
  shadow: open
</meta>

<script>
  /** 現在のカウント値 */
  state count: number = 0

  fn increment() {
    count += 1
  }
</script>

<template>
  <button @click="increment">カウント: {{ count }}</button>
</template>

<style>
  button { padding: 8px 16px; border-radius: 8px; }
</style>
```

## なぜ Chasket？

- **ゼロランタイム** — 標準の `HTMLElement` クラスにコンパイル。フレームワーク・仮想DOM・ランタイムライブラリは一切不要。
- **単一ファイルコンポーネント** — `<meta>`, `<script>`, `<template>`, `<style>` を1つの `.csk` ファイルに。
- **どこでも動く** — 出力はバニラWeb Components。React・Vue・Svelte・素のHTMLで利用可能。
- **組み込みリアクティビティ** — `state` の変更が自動的にDOMに反映。
- **スコープ付きCSS** — Shadow DOMでスタイルが自動隔離。
- **型チェック** — 未定義変数・型不一致・typoをコンパイル時に検出。
- **XSS対策済み** — `{{ }}` は自動エスケープ。生HTMLが必要な場合は `{{{ }}}` （警告付き）または `@html` でオプトイン。

## クイックスタート

```bash
# 1. chasket-cli をダウンロードしてディレクトリに入る
cd chasket-cli

# 2. 新規プロジェクトを作成
node bin/chasket.js init my-app

# 3. ビルド＆起動
cd my-app
node ../bin/chasket.js dev
# → http://localhost:3000 をブラウザで開く
```

## 言語概要

### Script 宣言

```chasket
<script>
  state count: number = 0            // リアクティブ変数
  prop  label: string = "default"    // 外部属性
  computed total: number = a + b     // 派生値（読み取り専用）
  ref   canvas: HTMLCanvasElement    // DOM参照

  fn increment() { count += 1 }     // メソッド（DOM自動更新）
  fn async fetchData() { ... }       // 非同期メソッド

  emit close: { reason: string }     // カスタムイベント（bubbles + composed）
  emit(local) internal: void         // バブリングしないイベント

  watch(count) { localStorage.setItem("count", String(count)) }

  on mount { console.log("接続完了") }
  on unmount { console.log("切断完了") }
</script>
```

### Template 構文

```chasket
<template>
  {{ expression }}                         <!-- テキスト（自動エスケープ） -->
  <img :src="imageUrl" />                  <!-- 動的属性 -->
  <button @click="handler">クリック</button> <!-- イベント -->
  <input :bind="text" />                   <!-- 双方向バインディング -->

  <#if condition="count > 0">              <!-- 条件分岐 -->
    <p>{{ count }} 件</p>
  <:else>
    <p>データなし</p>
  </#if>

  <#for each="item, index" of="items" key="item.id">
    <li>{{ item.name }}</li>               <!-- ループ -->
    <:empty><p>リストは空です</p></:empty>
  </#for>

  <slot name="header"></slot>              <!-- Web Componentスロット -->
</template>
```

### イベント修飾子

```chasket
<form @submit|prevent="handleSubmit">
<div @click|stop="handleClick">
<input @keydown|enter="search">
```

### Emit オプション

```chasket
emit close: { reason: string }              // デフォルト: bubbles + composed
emit(bubbles) notify: void                  // バブリングのみ
emit(composed) select: { id: number }       // Shadow DOM越えのみ
emit(local) internal: void                  // 自身のみ
```

## ビルド出力

```
dist/
├── chasket-bundle.js        ← 全コンポーネントのバンドル（通常これを使用）
└── components/            ← 個別ファイル（単体利用時）
    ├── app.js
    ├── button.js
    └── card.js
```

```html
<!-- 1行で全コンポーネントが使える -->
<script src="dist/chasket-bundle.js"></script>
<x-app></x-app>
```

## コンポーネントの合成

テンプレート内でタグ名を書くだけで他のコンポーネントを使用できます。

```chasket
<template>
  <x-card title="ユーザー">
    <x-button label="追加" @press="addUser" />
  </x-card>
</template>
```

バンドルは全コンポーネントの `customElements.define` を一括実行するため、ファイル順に関わらずネストが正しく動作します。

## VS Code 拡張機能

シンタックスハイライト・リアルタイム診断・ホバードキュメント・ファイルアイコンを提供します。

```bash
# インストール
cp -r chasket-vscode ~/.vscode/extensions/chasket-lang-0.1.0
```

機能:
- Chasket構文 + 埋め込みTypeScript/CSSのハイライト
- エラー検出: 未定義変数、型不一致、必須属性の欠落
- JSDocホバー: `/** コメント */` を宣言の上に書くとホバーで表示
- `#for` ループ変数のスコープ追跡

## CLIコマンド

| コマンド | 説明 |
|---------|------|
| `chasket init <名前>` | 新規プロジェクト作成 |
| `chasket dev` | 開発サーバー起動（ファイル監視付き） |
| `chasket build` | 本番ビルド |
| `chasket check` | 型チェックのみ |

## セキュリティ

- `{{ }}` テキスト補間は `#esc()` でHTMLエスケープ（シングルクォート含む）
- `{{{ }}}` 生補間はエスケープをバイパス（コンパイラがW0210警告を出力）
- 動的属性（`:src`, `:class` 等）は `#escAttr()` でエスケープ
- `@html` のみ意図的に未エスケープ（信頼できるデータにのみ使用）
- イベントハンドラの検証強化（eval/import()/require() をブロック、危険パターンに警告）
- 各コンポーネントはIIFEで包まれスコープが隔離
- CSP nonce対応、blob: はHMR有効時のみ許可
- 累計37件のセキュリティ脆弱性を修正済み

## ロードマップ

詳細は [docs/ROADMAP.md](docs/ROADMAP.md) を参照してください。

**現在（v0.2.x）:** 軽量・ゼロ依存のドロップイン Web Components — コンパイラ品質向上、npm公開
**次期（v0.3.x）:** 小〜中規模 SPA — keyed diff、動的スロット
**将来（v0.4.x+）:** フルスケール SPA — Rustコンパイラ コード生成、ESMバンドル、DevTools

## ライセンス

MIT
