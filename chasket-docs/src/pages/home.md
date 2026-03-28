<div class="hero">

# Chasket

<p class="tagline">テンプレートファーストの Web Components フレームワーク。<br>単一ファイルの <code>.csk</code> からネイティブ Web Components にコンパイル。</p>

<div class="hero-actions">
  <a href="/getting-started.html" class="btn btn-primary">Getting Started</a>
  <a href="/demos/" class="btn btn-secondary">Live Demos</a>
  <a href="https://github.com/UltraEgoist/chasket" class="btn btn-secondary" target="_blank">GitHub</a>
</div>

</div>

```chasket
<meta>
  name: "my-counter"
  shadow: open
</meta>
<script>
  state count: number = 0
  fn increment() { count++ }
</script>
<template>
  <button @click="increment">Count: {{ count }}</button>
</template>
<style>
  button { padding: 0.5rem 1rem; font-size: 1.2rem; }
</style>
```

<div class="features">
  <div class="feature">
    <div class="feature-icon">&#x26A1;</div>
    <h3>ゼロ依存</h3>
    <p>ランタイムライブラリ不要。コンパイル後のコードは Web 標準 API のみで動作します。</p>
  </div>
  <div class="feature">
    <div class="feature-icon">&#x1F3AF;</div>
    <h3>型安全</h3>
    <p>組み込みの型チェッカーとTypeScript出力。.d.ts も自動生成。</p>
  </div>
  <div class="feature">
    <div class="feature-icon">&#x1F512;</div>
    <h3>セキュリティ</h3>
    <p>32件のセキュリティ修正済み。XSS防止、プロトタイプ汚染防止、CSP対応を標準装備。</p>
  </div>
  <div class="feature">
    <div class="feature-icon">&#x1F680;</div>
    <h3>SSR対応</h3>
    <p>renderToString / renderToStream でサーバーサイドレンダリング。SEO最適化も万全。</p>
  </div>
  <div class="feature">
    <div class="feature-icon">&#x1F4E6;</div>
    <h3>フルスタック</h3>
    <p>ルーター、ストア、UIライブラリ、SSR、LSP、VSCode拡張を含む完全なエコシステム。</p>
  </div>
  <div class="feature">
    <div class="feature-icon">&#x2728;</div>
    <h3>HMR開発</h3>
    <p>ファイル保存で即座にブラウザ更新。Viteプラグインも対応。</p>
  </div>
</div>

## エコシステム

- **chasket-cli** — コンパイラ・CLI（init / build / check / dev）
- **chasket-ssr** — サーバーサイドレンダリング（string / stream）
- **chasket-router** — SPAルーター（hash / history / guards）
- **chasket-store** — 状態管理（Flux / Undo-Redo / middleware）
- **chasket-ui** — UIコンポーネントライブラリ（9コンポーネント）
- **chasket-lsp** — Language Server Protocol（12機能）
- **chasket-vscode** — VSCode拡張（ハイライト・補完・診断）
- **vite-plugin-chasket** — Vite統合（HMR対応）

## クイックスタート

```bash
npx chasket init my-app
cd my-app
npx chasket dev
```
