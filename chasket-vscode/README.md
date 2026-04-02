# Chasket for Visual Studio Code

> Part of the [Chasket](https://chasket.dev) ecosystem.
> [日本語](#日本語)

Development support extension for `.csk` (Chasket) files.

## Install

Search **"Chasket"** in the VS Code Extensions panel, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang).

## Features

### Syntax Highlighting

- Color-coded `<meta>`, `<script>`, `<template>`, `<style>` blocks
- Chasket keywords (`state`, `prop`, `computed`, `fn`, `emit`, `ref`, `watch`, `on mount`, etc.)
- `{{ }}` template interpolation
- Directives: `@click`, `:bind`, `#if`, `#for`
- Embedded TypeScript in `<script>`, CSS in `<style>`

### Real-Time Diagnostics

- Undefined variable detection (with typo suggestions: `cont` -> `Did you mean count?`)
- Type mismatches (e.g., calling `toUpperCase()` on a `number`)
- Missing `<template>` block
- Missing `key` attribute in `#for`
- Unclosed `#if` / `#for` blocks
- Missing hyphen in custom element names
- Unused `state` variable warnings
- Missing initial value in `state` declarations
- Import path validation: unresolved paths and missing named exports (v0.2.1+)

### Hover Information

- Hover over Chasket keywords (`state`, `prop`, `fn`, `emit`, etc.) to see usage documentation

### Go to Definition

- Jump to source files from `import` statements in `.csk` files (v0.2.1+)
- Supports `.ts`, `.js`, `.d.ts` resolution

### Editor Support

- Auto-closing brackets and tags (`{{ }}`, `<#if>...</#if>`, etc.)
- Block-level folding
- Auto-indentation
- File icons for `.csk` files

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `chasket.enableDiagnostics` | `true` | Enable/disable real-time type checking |
| `chasket.compilerPath` | `""` | Path to chasket-cli's `bin/chasket.js` |

## Other Editors

The `syntaxes/chasket.tmLanguage.json` TextMate grammar can be reused in other editors:

- **JetBrains IDEs** (WebStorm, IntelliJ): Import as TextMate Bundle
- **Sublime Text**: Convert to `.tmLanguage` and place in `Packages/`
- **Vim/Neovim**: Convert to syntax file or use `vim-polyglot`
- **Zed**: Place TextMate grammar in extensions directory

---

## 日本語

> [Chasket](https://chasket.dev) エコシステムの一部です。

`.csk` ファイルの開発サポート拡張機能です。

### インストール

VS Code の拡張機能パネルで「**Chasket**」を検索するか、[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=chasket.chasket-lang) からインストールしてください。

### 機能

**シンタックスハイライト** — `<meta>`, `<script>`, `<template>`, `<style>` 各ブロックの色分け。Chasket 固有キーワード、テンプレート補間、ディレクティブのハイライト。

**リアルタイムエラー表示** — 未定義変数の検出（typo サジェスト付き）、型の不一致、`<template>` ブロックの欠落、`#for` の `key` 属性欠落、未閉じブロック、カスタム要素名のハイフン欠落、未使用 `state` 変数の警告、インポートパスの検証（v0.2.1+）。

**ホバー情報** — Chasket キーワードにマウスを乗せると使い方が表示されます。

**定義ジャンプ** — `import` 文から `.ts` / `.js` ソースファイルへのジャンプ（v0.2.1+）。

**エディタサポート** — 括弧・タグの自動閉じ、ブロック単位の折りたたみ、自動インデント、`.csk` ファイルアイコン。

### 設定

| 設定項目 | デフォルト | 説明 |
|---------|-----------|------|
| `chasket.enableDiagnostics` | `true` | リアルタイム型チェックの有効/無効 |
| `chasket.compilerPath` | `""` | chasket-cli の `bin/chasket.js` へのパス |

### ファイル構成

```
chasket-vscode/
├── package.json                  <- 拡張機能マニフェスト
├── extension.js                  <- 診断ロジック（型チェック・エラー表示）
├── language-configuration.json   <- 括弧・コメント・インデント設定
├── syntaxes/
│   └── chasket.tmLanguage.json   <- TextMate シンタックス定義
├── icons/
│   ├── chasket-file-dark.svg     <- ファイルアイコン（ダークテーマ）
│   └── chasket-file-light.svg    <- ファイルアイコン（ライトテーマ）
└── README.md
```
