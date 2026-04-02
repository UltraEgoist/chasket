# Chasket

**[ドキュメント & ガイド](https://chasket.dev)** | [English](README.md)

テンプレートファーストのコンパイル型言語。ネイティブ Web Component にコンパイルします。

シンプルな `.csk` ファイルを書くだけで、ゼロランタイムの Custom Elements（Shadow DOM・スコープ付き CSS・リアクティビティ・型チェック付き）が手に入ります。

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

- **ゼロランタイム** — 標準の `HTMLElement` クラスにコンパイル。フレームワーク・仮想 DOM・ランタイムライブラリは一切不要。
- **単一ファイルコンポーネント** — `<meta>`, `<script>`, `<template>`, `<style>` を 1 つの `.csk` ファイルに。
- **どこでも動く** — 出力はバニラ Web Components。React・Vue・Svelte・素の HTML で利用可能。
- **組み込みリアクティビティ** — `state` の変更が自動的に DOM に反映。
- **スコープ付き CSS** — Shadow DOM でスタイルが自動隔離。
- **型チェック** — 未定義変数・型不一致・typo をコンパイル時に検出。
- **ES Module & TypeScript 対応** — `.ts` / `.js` ファイルからの import が可能。TypeScript は自動トランスパイル。
- **XSS 対策済み** — `{{ }}` は自動エスケープ。生 HTML が必要な場合は `{{{ }}}` （警告付き）または `@html` でオプトイン。

## クイックスタート

```bash
# 新規プロジェクトを作成（対話型セットアップ）
npm create chasket

# プロジェクト名を指定する場合
npm create chasket my-app
```

対話型セットアップでテンプレート（ミニマルカウンター・Todo アプリ・SPA）を選択でき、すぐに動くプロジェクトが生成されます。日本語・英語対応。

```bash
cd my-app
npm install
npm run dev
# http://localhost:3000 をブラウザで開く
```

`npx` でも利用可能です：

```bash
npx @chasket/chasket init my-app
```

### CLI コマンド

| コマンド | 説明 |
|---------|------|
| `chasket init` | 新規プロジェクト作成（対話型） |
| `chasket dev` | 開発サーバー起動（ライブリロード & HMR） |
| `chasket build` | 本番ビルド |
| `chasket check` | 型チェックのみ |

## 言語概要

### Script 宣言

```chasket
<script>
  state count: number = 0            // リアクティブ変数
  prop  label: string = "default"    // 外部属性
  computed total: number = a + b     // 派生値（読み取り専用）
  ref   canvas: HTMLCanvasElement    // DOM 参照

  fn increment() { count += 1 }     // メソッド（DOM 自動更新）
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
  <div @html="rawContent"></div>           <!-- 生 HTML（オプトイン） -->

  <#if condition="count > 0">              <!-- 条件分岐 -->
    <p>{{ count }} 件</p>
  <:else>
    <p>データなし</p>
  </#if>

  <#for each="item, index" of="items" key="item.id">
    <li>{{ item.name }}</li>               <!-- ループ -->
    <:empty><p>リストは空です</p></:empty>
  </#for>

  <slot name="header"></slot>              <!-- Web Component スロット -->
</template>
```

### イベント修飾子

```chasket
<form @submit|prevent="handleSubmit">
<div @click|stop="handleClick">
<input @keydown|enter="search">
```

### ES Module インポート（v0.3+）

外部の `.ts` / `.js` ファイルからインポートが可能です。インポートがある場合、コンパイラは ES Module 形式で出力します。

```chasket
<script>
  import { createStore } from '../lib/store';

  const store = createStore();
  state count: number = 0
</script>
```

`src/lib/` 内の TypeScript ファイルは `dist/lib/` に自動トランスパイルされます。バンドルの読み込みには `type="module"` を使用します：

```html
<script type="module" src="dist/chasket-bundle.js"></script>
```

## ビルド出力

```
dist/
├── chasket-bundle.js        <- 全コンポーネントのバンドル（通常これを使用）
├── lib/                     <- トランスパイル済み TypeScript ファイル
└── components/              <- 個別ファイル（単体利用時）
    ├── app.js
    ├── button.js
    └── card.js
```

```html
<!-- 1 行で全コンポーネントが使える -->
<script type="module" src="dist/chasket-bundle.js"></script>
<x-app></x-app>
```

## コンポーネントの合成

テンプレート内でタグ名を書くだけで他のコンポーネントを使用できます。ランタイムでの import は不要です。

```chasket
<template>
  <x-card title="ユーザー">
    <x-button label="追加" @press="addUser" />
  </x-card>
</template>
```

バンドルは全コンポーネントの `customElements.define` を一括実行するため、ファイル順に関わらずネストが正しく動作します。

## エディタサポート

### VS Code

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) からインストールできます。拡張機能パネルで「Chasket」を検索してください。

機能: シンタックスハイライト、リアルタイム診断、自動補完、ホバードキュメント、定義ジャンプ、アウトライン、ファイルアイコン。

### LSP 対応エディタ (Neovim, Sublime, Emacs, Helix)

```bash
npx chasket-lsp --stdio
```

LSP サーバーは補完、ホバー、定義ジャンプ、参照検索、リネーム、折りたたみ、シグネチャヘルプ、フォーマット、コードアクション、診断を提供します。各エディタの設定方法は [LSP API ドキュメント](docs/api/chasket-lsp.md) を参照してください。

## サーバーサイドレンダリング

```javascript
const { renderToString, renderPage } = require('@chasket/chasket-ssr');

const html = renderToString(source, { hydrate: true });
const page = renderPage({ title: 'My App', body: html, hydrate: true });
```

Express/Fastify との統合例は [SSR API ドキュメント](docs/api/chasket-ssr.md) を参照してください。

## エコシステム

| パッケージ | 説明 |
|---------|------|
| [`@chasket/chasket`](https://www.npmjs.com/package/@chasket/chasket) | コンパイラ & CLI |
| [`create-chasket`](https://www.npmjs.com/package/create-chasket) | プロジェクト生成 (`npm create chasket`) |
| `@chasket/chasket-ssr` | サーバーサイドレンダリング（ハイドレーション対応） |
| `@chasket/chasket-lsp` | Language Server Protocol（エディタ統合） |
| `@chasket/chasket-router` | SPA ルーティング (`<chasket-router>`, `<chasket-link>`) |
| `@chasket/chasket-store` | Flux 型ステート管理（undo/redo 対応） |
| `@chasket/chasket-ui` | アクセシブルな UI コンポーネント 9 種 (`<fl-button>`, `<fl-dialog>` 等) |
| `@chasket/vite-plugin-chasket` | Vite 統合（HMR 対応） |
| [`chasket-vscode`](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) | VS Code 拡張機能 |
| `chasket-compiler-rust` | 実験的 Rust コンパイラ（パーサーステージ） |

## ドキュメント

- [はじめに](docs/getting-started.md) — Chasket を始める
- [API リファレンス](docs/API.md) — Chasket 言語構文の完全なリファレンス
- [ES Module & TypeScript ガイド](docs/module-and-typescript.md) — インポートと TypeScript のサポート
- [SSR ガイド](docs/api/chasket-ssr.md) — サーバーサイドレンダリング
- [LSP ガイド](docs/api/chasket-lsp.md) — エディタ統合・Language Server
- [Router API](docs/api/chasket-router.md) / [Store API](docs/api/chasket-store.md) / [UI API](docs/api/chasket-ui.md)
- [技術学習ガイド](docs/LEARNING_GUIDE.md) — コンパイラの内部構造
- [セキュリティポリシー](SECURITY.md) — 脆弱性報告とセキュリティ設計原則
- [ロードマップ](docs/ROADMAP.md) — 今後の開発計画
- [コントリビューティング](CONTRIBUTING.md) — ブランチ戦略・コミット規則・リリースフロー

## ロードマップ

詳細は [docs/ROADMAP.md](docs/ROADMAP.md) を参照してください。

**現在 (v0.3.x):** 対話型プロジェクト作成、ES Module/TypeScript インポート、CLI 多言語化、テンプレート選択
**次期 (v0.4.x):** Keyed list reconciliation、動的スロット、小〜中規模 SPA 機能
**将来 (v0.5.x+):** Rust コンパイラ コード生成、ESM バンドル、DevTools

- [x] ES Module & TypeScript インポート対応
- [x] 対話型 `chasket init`（テンプレート選択付き）
- [x] `npm create chasket` によるプロジェクト生成
- [x] CLI 多言語化（日本語 / 英語）
- [x] VS Code 拡張機能を Marketplace に公開
- [x] セキュリティ監査（5 回の監査で 37 件の脆弱性を修正）
- [ ] Keyed diff reconciliation
- [ ] Rust コンパイラ コード生成 & WASM 出力
- [ ] Playwright E2E テスト

## セキュリティ

- `{{ }}` テキスト補間は `#esc()` で HTML エスケープ（シングルクォート含む）
- 動的属性（`:src`, `:class` 等）は `#escAttr()` でエスケープ
- `{{{ }}}` 生補間はエスケープをバイパス（コンパイラが W0210 警告を出力）
- `@html` のみ意図的に未エスケープ（信頼できるデータにのみ使用）
- イベントハンドラの検証強化（eval/import()/require() をブロック、危険パターンに警告）
- 各コンポーネントは IIFE で包まれスコープが隔離（インポート使用時は ES Module）
- CSP nonce 対応、blob: は HMR 有効時のみ許可
- 累計 37 件のセキュリティ脆弱性を修正済み
- 詳細は [SECURITY.md](SECURITY.md) を参照

## ライセンス

MIT
