# Chasket VSCode Extension — 開発解説

## 概要

Chasket VSCode 拡張機能は、`.csk`（Chasket Web Component）ファイルの開発体験を向上させるエディタ拡張です。v0.2.2 では、シンタックスハイライト、補完、ホバー情報、診断、定義ジャンプ、ドット補完、クロスファイル補完、EN/JA 自動切替を提供します。

---

## アーキテクチャ

### デュアルモード構成

拡張機能は「LSP モード」と「インラインモード」の二段構えになっています。

**LSP モード**: `chasket-cli` がインストールされている場合、`vscode-languageclient` を使って LSP サーバーを起動し、全機能を委譲します。LSP サーバーのパスは `chasket.compilerPath` で設定可能です。

**インラインモード（フォールバック）**: LSP が利用できない場合、`extension.js` 内に実装された6つのプロバイダーが直接動作します。現在はこちらがメインの動作モードです。

### 6つのプロバイダー

1. **HoverProvider** — カーソル位置のキーワードやシンボルに対してドキュメントを表示
2. **CompletionItemProvider** — Chasket キーワード・ディレクティブ・イベントの補完
3. **CompletionItemProvider (dot)** — `console.`、`window.`、`document.` 等の JS 組み込み API 補完
4. **CompletionItemProvider (tag)** — `<` トリガーによるプロジェクト内コンポーネントタグ補完
5. **DefinitionProvider** — シンボルの定義位置へのジャンプ
6. **DocumentSymbolProvider** — アウトラインビュー用のシンボル一覧
7. **DiagnosticsProvider** — リアルタイム型チェック・エラー表示（16種類のルール）

---

## 補完システムの設計

### ブロック検出 (`detectBlock`)

`.csk` ファイルは `<meta>`、`<script>`、`<template>`、`<style>` の4ブロックで構成されます。`detectBlock()` はカーソル行までのタグを走査して現在のブロックを判定し、ブロックごとに適切な補完候補をフィルタリングします。

- **script** → `state`, `fn`, `watch`, `import` 等（テンプレートディレクティブは除外）
- **template** → `@click`, `:class`, `#if`, `#for` 等（script キーワードは除外）
- **meta** → `name`, `shadow`, `form`, `generic` のみ
- **style** → Chasket 補完は出さず、VSCode の CSS 補完に任せる

### イベント修飾子補完

`@click|` と入力すると修飾子候補（`prevent`, `stop`, `once`, `self`, `capture`, `enter`, `esc`）が表示されます。既に使われている修飾子は自動的に除外されます。`@click|prevent|` の後には残り6つだけが提案されます。

正規表現には `{0,10}` の上限を設けて ReDoS を防止しています。

### JS 組み込み API ドット補完

`.` をトリガー文字として専用の `provideDotCompletion` プロバイダーを登録しています。`JS_BUILTINS` 辞書に以下のオブジェクトのメンバーが定義されています:

- `console` (15メンバー) — `log`, `error`, `warn`, `table`, `time` 等
- `Math` (24メンバー) — `floor`, `random`, `PI`, `sqrt` 等
- `JSON` (2メンバー) — `stringify`, `parse`
- `Object` (10メンバー) — `keys`, `values`, `entries`, `assign` 等
- `Array` (3メンバー) — `isArray`, `from`, `of`
- `Promise` (6メンバー) — `all`, `allSettled`, `race`, `resolve` 等
- `Number` (7メンバー) — `isFinite`, `isNaN`, `MAX_SAFE_INTEGER` 等
- `document` (16メンバー) — `querySelector`, `createElement`, `body` 等
- `window` (32メンバー) — `setTimeout`, `fetch`, `innerWidth`, `localStorage` 等
- `this` (23メンバー) — `shadowRoot`, `getAttribute`, `classList`, `dispatchEvent` 等

`this.` の補完はWeb Component（CustomElement）のコンテキストに合わせて設計しています。

**実装上のポイント**: VSCode の補完フィルタリングが `.` の後の空文字列に対して正しく動作するよう、各アイテムに `range`（ドット直後〜カーソル位置）と `filterText` を明示設定し、`CompletionList` オブジェクトとして返しています。単純な配列を返す方式では VSCode がアイテムをフィルタリングして表示しないことがあります。

### クロスファイルコンポーネント補完

`scanProjectComponents()` がワークスペース内の全 `.csk` ファイルを走査し、`<meta>` ブロックの `name` 属性からコンポーネント名を抽出してキャッシュします。`FileSystemWatcher` で `.csk` ファイルの作成・変更・削除を監視し、キャッシュをリアルタイム更新します。`<` を入力すると、プロジェクト内のコンポーネントタグ名が補完候補として表示されます。

---

## i18n（国際化）設計

### ランタイム i18n (`extension.js` 内)

VSCode のロケール設定に基づいて日本語/英語を自動切替します。

```javascript
function isJa() { return vscode.env.language.startsWith('ja'); }
function t(en, ja) { return isJa() ? ja : en; }
```

**対応箇所と件数:**
- HOVER辞書: 39エントリ（`isJa()` 分岐）
- COMPLETIONS辞書: 123エントリ（`t()` 関数）
- EVENT_MODIFIERS: 7エントリの `doc` フィールド（`t()` 関数）
- JS_BUILTINS: 主要メンバーの `doc` フィールド（`t()` 関数）
- 診断メッセージ: 16件全て（`t()` 関数）
- ホバー動的テキスト: 全て対応

HOVER辞書は `getHover()` でレイジー初期化し、初回アクセス時に `isJa()` の結果で辞書全体を構築してキャッシュします。

### パッケージ i18n (`package.nls.json`)

VSCode の標準メカニズムである `package.nls.json`（英語）と `package.nls.ja.json`（日本語）を使用し、`package.json` 内の `%key%` プレースホルダーを置換します。

対応フィールド:
- `extension.description` — 拡張機能の説明
- `config.enableDiagnostics.description` — 診断設定の説明
- `config.compilerPath.description` — コンパイラパス設定の説明

---

## TextMate 文法 (`chasket.tmLanguage.json`)

### ブロック構造

4つのトップレベルブロックを定義:
- `meta-block` — `<meta>` 内のキー:値ペア
- `script-block` — `contentName: "source.js"` で JS 埋め込み + Chasket 独自キーワード
- `template-block` — `contentName: "text.html.basic"` で HTML 埋め込み + ディレクティブ
- `style-block` — `source.css` を直接 include

### Chasket 独自スコープ

- `entity.name.tag.component.csk` — ハイフン入りカスタム要素タグ（例: `my-component`）
- `entity.name.tag.html` — 標準 HTML タグ
- `keyword.declaration.csk` — `state`, `prop`, `computed` 等
- `keyword.control.directive.csk` — `#if`, `#for`, `:else`, `:else-if`
- `entity.other.attribute-name.event.csk` — `@click`, `@keydown` 等（65イベント完全対応）
- `entity.other.attribute-name.modifier.csk` — `|prevent`, `|stop` 等
- `keyword.operator.binding.csk` — `:bind`, `:class` 等

### 式ハイライト

`@event="handler"` や `:bind="expression"` の属性値内は `#script-content` パターンを適用し、式として構文ハイライトします。lookbehind `(?<=[@:][-\\w]+(?:\\|\\w+)*=)` で判定しています。

---

## セキュリティ対策

### SEC-1: JSDoc XSS サニタイズ

補完アイテムの `documentation` に埋め込まれるユーザー定義 JSDoc を `<>` エスケープして、Markdown レンダラー経由の XSS を防止。

### SEC-2: 動的 RegExp の ReDoS 防止

`new RegExp()` に渡すユーザー入力（関数名、state 名）のメタ文字を `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` でエスケープ。

### SEC-3: 量指定子制限

イベント修飾子の regex `(?:\|[\w]*)*` に `{0,10}` 上限を設け、極端に長いパイプチェーンでのバックトラッキングを防止。

### その他の安全設計

- `eval()` や `new Function()` は一切使用していない
- ファイルシステムアクセスは `vscode.workspace.findFiles()` のみ（glob パターンで `node_modules` 除外）
- 外部依存なし（`package.json` に `dependencies` がない）
- `scanProjectComponents()` のエラーは `.catch()` で安全にハンドリング

---

## VSCode へのインストールとデプロイ

### ディレクトリ名の規則

VSCode の拡張機能フォルダ（`~/.vscode/extensions/`）に配置する場合、ディレクトリ名は **`{publisher}.{name}-{version}`** の形式にする必要があります。

```
✗ chasket-vscode              → VSCode が認識しない
✗ chasket-lang-0.2.2          → publisher プレフィックスがない
✓ aspect.chasket-lang-0.2.2   → 正しい形式
```

### `extensions.json` の役割

`~/.vscode/extensions/extensions.json` は VSCode が管理する拡張機能のレジストリです。各拡張の `location` フィールドに実際のディレクトリパスが記録されています。手動で拡張をコピーした場合、このファイルのパスが古いままだと VSCode がファイルを見つけられずエラーになります。

### `.obsolete` ファイル

`~/.vscode/extensions/.obsolete` は VSCode がアンインストールした拡張を記録する JSON ファイルです。`"aspect.chasket-lang-0.2.2": true` のようなエントリがあると、ディレクトリが存在していても VSCode はその拡張を無視します。再インストール時にはこのエントリを削除する必要があります。

### `.vscodeignore`

`vsce package` 実行時にパッケージから除外するファイルを指定します。親ディレクトリの `.git/config` に認証トークンが含まれている場合、`.git/**` を除外しないとセキュリティ警告が出ます。

---

## Marketplace 公開要件

| 要件 | 状態 |
|------|------|
| `package.json` の `publisher` フィールド | ✓ `aspect` |
| `package.json` の英語 `description` | ✓ `package.nls.json` で提供 |
| 128×128 PNG アイコン | ✓ `icons/chasket-icon.png` |
| `LICENSE` ファイル | ✓ MIT License |
| `CHANGELOG.md` | ✓ v0.2.2 / v0.1.0 エントリ |
| `README.md` | ✓ インストール手順・機能説明 |
| `.vscodeignore` | ✓ `.git`, `.vsix` 等を除外 |

### 公開手順

```bash
cd chasket-vscode
npx @vscode/vsce package           # .vsix ファイル生成
npx @vscode/vsce login aspect      # Azure DevOps PAT でログイン
npx @vscode/vsce publish           # Marketplace に公開
```

---

## ファイル構成（最終）

```
chasket-vscode/
├── package.json                  ← 拡張マニフェスト（%nls% プレースホルダー）
├── package.nls.json              ← 英語テキスト（デフォルト）
├── package.nls.ja.json           ← 日本語テキスト
├── extension.js                  ← 全プロバイダー実装（~1850行）
├── language-configuration.json   ← 括弧・コメント・インデント設定
├── syntaxes/
│   └── chasket.tmLanguage.json   ← TextMate 文法定義（222行）
├── icons/
│   ├── chasket-icon.png          ← Marketplace アイコン（128×128）
│   ├── chasket-icon.svg          ← アイコンソース
│   ├── chasket-file-dark.svg     ← ファイルアイコン（ダークテーマ）
│   └── chasket-file-light.svg    ← ファイルアイコン（ライトテーマ）
├── CHANGELOG.md                  ← 変更履歴
├── README.md                     ← ユーザー向け説明
├── LICENSE                       ← MIT License
└── .vscodeignore                 ← パッケージ除外設定
```
