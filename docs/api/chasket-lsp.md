# @aspect/chasket-lsp API Reference

Chasket 言語のための Language Server Protocol (LSP) 実装。VSCode, Neovim, Sublime Text, Emacs など LSP 対応エディタで利用できます。

## Installation

```bash
npm install @aspect/chasket-lsp
```

## 起動方法

### stdio モード（デフォルト）

```bash
npx chasket-lsp --stdio
```

### Node.js から直接起動

```javascript
const { createServer } = require('@aspect/chasket-lsp');

const server = createServer(process.stdin, process.stdout);
server.start();
```

---

## エディタ別セットアップ

### VSCode

`chasket-vscode` 拡張機能が `vscode-languageclient` を検出すると、自動的に LSP モードで動作します。手動設定は不要です。

LSP モードが利用できない場合は、拡張機能内蔵のインラインプロバイダーにフォールバックします。

```bash
# VSCode 拡張をインストール
cp -r chasket-vscode ~/.vscode/extensions/chasket-lang-0.1.0

# （オプション）LSP モードを有効化
cd chasket-vscode && npm install vscode-languageclient
```

### Neovim (nvim-lspconfig)

```lua
-- init.lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

configs.csk = {
  default_config = {
    cmd = { 'npx', 'chasket-lsp', '--stdio' },
    filetypes = { 'chasket' },
    root_dir = lspconfig.util.root_pattern('chasket.config.json', 'package.json'),
    settings = {},
  },
}

lspconfig.csk.setup({})
```

`filetype.lua` で `.csk` ファイルを認識させる:

```lua
vim.filetype.add({
  extension = {
    chasket = 'chasket',
  },
})
```

### Sublime Text (LSP パッケージ)

`Preferences > Package Settings > LSP > Settings` に以下を追加:

```json
{
  "clients": {
    "chasket": {
      "enabled": true,
      "command": ["npx", "chasket-lsp", "--stdio"],
      "selector": "source.csk",
      "initializationOptions": {}
    }
  }
}
```

### Emacs (lsp-mode)

```elisp
(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(chasket-mode . "chasket"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection '("npx" "chasket-lsp" "--stdio"))
    :activation-fn (lsp-activate-on "chasket")
    :server-id 'chasket-lsp)))
```

### Helix

`languages.toml`:

```toml
[[language]]
name = "chasket"
scope = "source.csk"
file-types = ["chasket"]
language-servers = ["chasket-lsp"]

[language-server.csk-lsp]
command = "npx"
args = ["chasket-lsp", "--stdio"]
```

---

## 対応 LSP 機能

| 機能 | メソッド | 説明 |
|------|----------|------|
| 自動補完 | `textDocument/completion` | スクリプト/テンプレート/CSS/メタ ブロック対応 |
| ホバー情報 | `textDocument/hover` | キーワード説明 + ユーザー定義シンボル情報 |
| 定義ジャンプ | `textDocument/definition` | state, prop, fn, computed への Go to Definition |
| 参照一覧 | `textDocument/references` | シンボルの全使用箇所を検索 |
| リネーム | `textDocument/rename` | シンボル一括リネーム |
| アウトライン | `textDocument/documentSymbol` | コンポーネント構造のツリー表示 |
| 折りたたみ | `textDocument/foldingRange` | ブロック・制御構造の折りたたみ |
| シグネチャ | `textDocument/signatureHelp` | 関数呼び出し時のパラメータ表示 |
| 整形 | `textDocument/formatting` | ドキュメント全体のインデント整形 |
| コードアクション | `textDocument/codeAction` | タイポ修正候補の提案 |
| 診断 | `textDocument/publishDiagnostics` | リアルタイムのエラー・警告通知 |

---

## 補完の詳細

### `<script>` ブロック内

キーワード補完（スニペット付き）:

| 補完 | 展開結果 |
|------|----------|
| `state` | `state name: string = ""` |
| `prop` | `prop name: string = ""` |
| `computed` | `computed name: number = expression` |
| `fn` | `fn name() { ... }` |
| `fn async` | `fn async name() { ... }` |
| `emit` | `emit name: void` |
| `ref` | `ref name: HTMLElement` |
| `watch` | `watch(dep) { ... }` |
| `on mount` | `on mount { ... }` |
| `on unmount` | `on unmount { ... }` |
| `provide` | `provide name: string = ""` |
| `consume` | `consume name: string from tag` |
| `import` | `import name from "module"` |

ユーザー定義シンボル（state, prop, fn 等）も補完候補に表示されます。

### `<template>` ブロック内

| トリガー | 補完内容 |
|----------|----------|
| `@` | イベントハンドラ (`@click`, `@input`, `@submit` 等) |
| `:` | 動的属性 (`:class`, `:style`, `:src`, `:bind` 等) |
| `{{` | ユーザー定義の state, prop, computed 変数 |
| `<` | テンプレートタグ (`#if`, `#for`, `slot`) |

### `<style>` ブロック内

| 補完 | 説明 |
|------|------|
| `:host` | Shadow DOM ホストセレクタ |
| `:host()` | 条件付きホストセレクタ |
| `::slotted()` | スロットコンテンツセレクタ |

### `<meta>` ブロック内

| 補完 | 説明 |
|------|------|
| `name` | コンポーネントタグ名 |
| `shadow` | Shadow DOM モード (`open`, `closed`, `none`) |
| `form` | Form-associated Custom Element |

---

## 診断

Chasket コンパイラの `compile()` を使用して、リアルタイムでエラーと警告を検出します。

| コード | 種別 | 内容 |
|--------|------|------|
| `E0001` | エラー | テンプレートブロック欠損 |
| `E0002` | エラー | 不正なコンポーネント名 |
| `E0003` | エラー | 型不一致 |
| `E0004` | エラー | 未定義の識別子 |
| `W0001` | 警告 | 未使用の state 変数 |
| `W0002` | 警告 | `@html` の使用（XSS リスク） |

診断は 300ms のデバウンスで配信され、入力中のパフォーマンスへの影響を最小限に抑えます。

---

## 初期化オプション

`initialize` リクエストの `initializationOptions` で以下を設定できます:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `compilerPath` | `string` | auto-detect | Chasket コンパイラ (`compiler.js`) のパス |

コンパイラは以下の順序で自動検出されます:

1. `initializationOptions.compilerPath` で指定されたパス
2. ワークスペースルート内の `chasket-cli/lib/compiler.js`
3. `chasket-lsp` パッケージに隣接する `chasket-cli/lib/compiler.js`

---

## Node.js API

LSP サーバーをプログラムから利用する場合:

```javascript
const { createServer, ChasketLanguageService } = require('@aspect/chasket-lsp');

// --- サーバーとして起動 ---
const server = createServer(process.stdin, process.stdout);
server.start();

// --- 言語サービスを直接利用 ---
const service = new ChasketLanguageService();
service.setCompilerPath('/path/to/chasket-cli/lib/compiler.js');

// ドキュメントを開く
service.openDocument('file:///app.csk', sourceCode, 1);

// 診断を取得
const diagnostics = service.getDiagnostics('file:///app.csk');

// ホバー情報を取得
const hover = service.getHover('file:///app.csk', { line: 5, character: 10 });

// 補完候補を取得
const completions = service.getCompletion('file:///app.csk', { line: 5, character: 0 });

// 定義へジャンプ
const definition = service.getDefinition('file:///app.csk', { line: 10, character: 15 });
```

### ChasketLanguageService メソッド

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `setCompilerPath(path)` | `string` | `void` | コンパイラパスを設定 |
| `openDocument(uri, text, version)` | `string, string, number` | `void` | ドキュメントを開く |
| `updateDocument(uri, text, version)` | `string, string, number` | `void` | ドキュメントを更新 |
| `closeDocument(uri)` | `string` | `void` | ドキュメントを閉じる |
| `getDiagnostics(uri)` | `string` | `Diagnostic[]` | 診断結果を取得 |
| `getHover(uri, position)` | `string, Position` | `Hover \| null` | ホバー情報を取得 |
| `getCompletion(uri, position)` | `string, Position` | `CompletionItem[]` | 補完候補を取得 |
| `getDefinition(uri, position)` | `string, Position` | `Location \| null` | 定義位置を取得 |
| `getReferences(uri, position)` | `string, Position` | `Location[]` | 参照一覧を取得 |
| `getRenameEdits(uri, position, newName)` | `string, Position, string` | `WorkspaceEdit \| null` | リネーム編集を取得 |
| `getDocumentSymbols(uri)` | `string` | `DocumentSymbol[]` | シンボル一覧を取得 |
| `getFoldingRanges(uri)` | `string` | `FoldingRange[]` | 折りたたみ範囲を取得 |
| `getSignatureHelp(uri, position)` | `string, Position` | `SignatureHelp \| null` | シグネチャ情報を取得 |
| `formatDocument(uri)` | `string` | `TextEdit[]` | 整形結果を取得 |

---

## TypeScript

TypeScript 型定義が `index.d.ts` に含まれています。

```typescript
import { createServer, ChasketLanguageService } from '@aspect/chasket-lsp';
import type { Position, Diagnostic, CompletionItem } from '@aspect/chasket-lsp';
```
