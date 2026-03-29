# Chasket for Visual Studio Code

> Part of the [Chasket](https://chasket.dev) ecosystem.

`.csk` ファイルの開発サポート拡張機能です。

## 機能

### シンタックスハイライト
- `<meta>`, `<script>`, `<template>`, `<style>` 各ブロックの色分け
- Chasket固有キーワード（`state`, `prop`, `computed`, `fn`, `emit`, `ref`, `watch`, `on mount` 等）のハイライト
- `{{ }}` テンプレート補間のハイライト
- `@click`, `:bind`, `#if`, `#for` 等のディレクティブのハイライト
- `<style>` ブロック内はCSS、`<script>` ブロック内はTypeScript風のハイライト

### リアルタイムエラー表示
- 未定義変数の検出（typoサジェスト付き: `cont` → `count のことですか？`）
- 型とメソッドの不一致（`number` 型に `toUpperCase()` を呼ぶ等）
- `<template>` ブロックの欠落
- `#for` の `key` 属性欠落
- 未閉じの `#if` / `#for` ブロック
- カスタム要素名のハイフン欠落
- 未使用 `state` 変数の警告
- `state` 宣言の初期値欠落

### ホバー情報
- Chasketキーワード（`state`, `prop`, `fn`, `emit` 等）にマウスを乗せると使い方が表示される

### エディタサポート
- 括弧・タグの自動閉じ（`{{ }}`、`<#if>...</#if>` 等）
- ブロック単位の折りたたみ
- 自動インデント

## インストール方法

### 方法A: フォルダをコピー（最も簡単）

```bash
# VS Code 拡張機能フォルダにコピー

# macOS
cp -r chasket-vscode ~/.vscode/extensions/chasket-lang-0.1.0

# Linux
cp -r chasket-vscode ~/.vscode/extensions/chasket-lang-0.1.0

# Windows
xcopy chasket-vscode %USERPROFILE%\.vscode\extensions\chasket-lang-0.1.0\ /E /I
```

VS Code を再起動すると `.csk` ファイルが認識されます。

### 方法B: VSIX パッケージ化

```bash
# vsce をインストール（初回のみ）
npm install -g @vscode/vsce

# パッケージ化
cd chasket-vscode
vsce package

# インストール
code --install-extension chasket-lang-0.1.0.vsix
```

## 設定

| 設定項目 | デフォルト | 説明 |
|---------|-----------|------|
| `chasket.enableDiagnostics` | `true` | リアルタイム型チェックの有効/無効 |
| `chasket.compilerPath` | `""` | chasket-cli の `bin/chasket.js` へのパス |

## 他のIDEへの展開

このリポジトリの `syntaxes/chasket.tmLanguage.json` は TextMate 文法ファイルなので、
TextMate 文法をサポートする他のエディタでも流用できます：

- **JetBrains IDE** (WebStorm, IntelliJ): TextMate Bundle としてインポート
- **Sublime Text**: `.tmLanguage` に変換して `Packages/` に配置
- **Vim/Neovim**: `vim-polyglot` または手動で syntax ファイルに変換
- **Zed**: extensions ディレクトリに TextMate 文法を配置

## ファイルの構成

```
chasket-vscode/
├── package.json                  ← 拡張機能マニフェスト
├── extension.js                  ← 診断ロジック（型チェック・エラー表示）
├── language-configuration.json   ← 括弧・コメント・インデント設定
├── syntaxes/
│   └── chasket.tmLanguage.json     ← TextMate シンタックス定義
├── icons/
│   ├── chasket-file-dark.svg       ← ファイルアイコン（ダークテーマ）
│   └── chasket-file-light.svg      ← ファイルアイコン（ライトテーマ）
└── README.md
```
