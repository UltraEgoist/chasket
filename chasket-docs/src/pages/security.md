# セキュリティ

Chasket はセキュリティを重視して設計されています。32件の脆弱性修正と607件のテスト（うち45件がセキュリティ専用）で品質を保証しています。

## XSS 防止

### 自動エスケープ

テンプレートの `{{ }}` インターポレーションは自動的にHTMLエスケープされます。

```chasket
<template>
  <!-- 安全: <script> タグはエスケープされる -->
  <p>{{ userInput }}</p>
</template>
```

### URL サニタイズ

`:href` と `:src` 属性は危険なURLプロトコルを自動ブロックします。

```chasket
<template>
  <!-- javascript:alert(1) → about:blank に変換 -->
  <a :href="url">Link</a>
</template>
```

ブロックされるプロトコル: `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`

多重エンコーディング攻撃にも対応（最大5段階のデコード後にチェック）。

### イベントハンドラ検証

`@click` 等のイベントハンドラ式は安全性チェックが行われます。以下のパターンは拒否されます:

- `eval()` / `Function()` の使用
- `__proto__` / `constructor` へのアクセス
- テンプレートリテラル
- 正規表現リテラル
- 複数文（セミコロン区切り）

### on* 属性ブロック

動的な `on*` 属性（`:onclick`, `:onload` 等）はコンパイル時に警告・ブロックされます。

## プロトタイプ汚染防止

### SSR 式評価

`createEvaluator` は `constructor`, `prototype`, `__proto__` をスコープ内で `undefined` にシャドウし、式からのプロトタイプ汚染を防止します。

### State オーバーライド

SSR の `state` / `props` オーバーライドでは `__proto__`, `constructor`, `prototype` キーが自動フィルタされます。

### ルーター クエリパース

`parseQuery()` は `Object.create(null)` でプロトタイプチェーンのないオブジェクトを使用し、`__proto__` 等の危険キーをフィルタします。

### Store deepClone

`deepClone` は `__proto__`, `constructor`, `prototype` キーをスキップし、循環参照を検出します。dispatch 結果は自動的にサニタイズされます。

## CSP (Content Security Policy)

### 開発サーバー

dev server は以下のセキュリティヘッダーを設定します:

- `Content-Security-Policy` — CSP nonce 対応（リクエストごとに一意生成）
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store` — 開発中はキャッシュ無効
- CORS は `localhost` のみ許可

### HMR

HMR は `eval()` を使用せず、Blob URL 方式でモジュールを更新します。

## パストラバーサル防止

dev server はパストラバーサル攻撃を防止します:

- 二重エンコード（`%252e%252e`）のデコード・検出
- シンボリックリンクの TOCTOU（Time of Check to Time of Use）対策
- プロジェクトルート外へのアクセスを403で拒否

## WebSocket セキュリティ

- Origin ヘッダー検証（`localhost` のみ許可）
- `Sec-WebSocket-Key` の RFC 6455 準拠チェック

## LSP セキュリティ

- JSON-RPC パーサーは不正な `Content-Length`（負数、非数値、ゼロ）に対してクラッシュしません
- 深いネスティング（500段階）の JSON をスタックオーバーフローなしで処理
- null バイトを含むメソッド名を安全に処理

## セキュリティテスト

45件のセキュリティ専用テスト（`test/security.test.js`）が以下の領域をカバーしています:

- SSR 式評価サンドボックス（S-32 〜 S-37）
- SSR ストリーミングセキュリティ（S-38 〜 S-41）
- エスケープ関数エッジケース（S-42 〜 S-48）
- LSP JSON-RPC パーサー堅牢性（S-49 〜 S-54）
- provide/consume セキュリティ（S-55 〜 S-58）
- import パスセキュリティ（S-59 〜 S-61）
- XSS ベクター追加テスト（S-62 〜 S-64）
- ルーター URL セキュリティ（S-65 〜 S-68）
- Store deepClone 高度な攻撃（S-69 〜 S-72）
- 複合攻撃ベクター（S-73 〜 S-76）

## 設計上の注意事項

- `@html` ディレクティブは意図的にエスケープをバイパスします。ユーザー入力を直接渡さないでください
- `.csk` ファイル自体は信頼済みソースコードとして扱います
- dev server はローカル開発専用です。本番環境でのホスティングには使用しないでください
- SSR の `createEvaluator()` は `new Function()` を使用します。信頼できるソースコードのみ処理してください

## 脆弱性報告

セキュリティの問題を発見した場合は、GitHub Issues ではなく `SECURITY.md` に記載の連絡先にご報告ください。
