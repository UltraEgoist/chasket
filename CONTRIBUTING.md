# Contributing — Chasket 開発ガイド

## ブランチ戦略

```
main                          ← リリース可能な安定版（npm publish はここから）
├── develop                   ← 開発統合ブランチ（次期リリースの作業場所）
│   ├── feat/xxx              ← 新機能
│   ├── fix/xxx               ← バグ修正
│   ├── refactor/xxx          ← リファクタリング
│   ├── test/xxx              ← テスト追加・修正
│   └── docs/xxx              ← ドキュメント
└── release/vX.Y.Z            ← リリース準備（develop → main のバッファ）
```

### フロー

1. `develop` から作業ブランチを作成
2. 作業完了後 `develop` にマージ
3. リリース時に `release/vX.Y.Z` ブランチを作成、最終調整
4. `main` にマージ → タグ付け → npm publish

### ブランチ命名規則

| パターン | 用途 | 例 |
|---|---|---|
| `feat/{機能名}` | 新機能の追加 | `feat/keyed-diff` |
| `fix/{対象}` | バグ修正 | `fix/class-merge` |
| `refactor/{対象}` | リファクタリング | `refactor/compiler-codegen` |
| `test/{対象}` | テスト追加・修正 | `test/inline-whitespace` |
| `docs/{対象}` | ドキュメント更新 | `docs/api-reference` |
| `security/{対象}` | セキュリティ修正 | `security/xss-escape` |
| `release/v{X.Y.Z}` | リリース準備 | `release/v0.3.0` |

## コミットメッセージ規則

[Conventional Commits](https://www.conventionalcommits.org/) に準拠。

```
{type}({scope}): {概要}

{本文（任意）}

{フッター（任意）}
```

### type

| type | 用途 | SemVer への影響 |
|---|---|---|
| `feat` | 新機能 | minor バージョンアップ |
| `fix` | バグ修正 | patch バージョンアップ |
| `refactor` | リファクタリング（動作変更なし） | なし |
| `test` | テスト追加・修正 | なし |
| `docs` | ドキュメントのみの変更 | なし |
| `build` | ビルド・CI 関連 | なし |
| `security` | セキュリティ修正 | patch バージョンアップ |
| `perf` | パフォーマンス改善 | patch バージョンアップ |
| `chore` | その他（依存更新、設定変更など） | なし |

### scope

モノレポ内のパッケージ名を使用する。

| scope | 対象パッケージ |
|---|---|
| `compiler` | `chasket-cli/lib/compiler.js` |
| `cli` | `chasket-cli/bin/chasket.js` |
| `ssr` | `chasket-ssr` |
| `router` | `chasket-router` |
| `store` | `chasket-store` |
| `ui` | `chasket-ui` |
| `lsp` | `chasket-lsp` |
| `vscode` | `chasket-vscode` |
| `vite` | `vite-plugin-chasket` |
| (省略) | 複数パッケージにまたがる場合 |

### 例

```
feat(compiler): keyed diff アルゴリズムを実装
fix(compiler): :class 属性マージの重複出力を修正
refactor(cli): buildEntry のエラーハンドリングを改善
test(compiler): インライン要素空白制御テストを追加
docs: README のロードマップを更新
security(ssr): renderToString の XSS エスケープを強化
build: GitHub Actions に Node 22 テストを追加
```

### Breaking Changes

互換性を壊す変更がある場合は、type の後に `!` を付け、フッターに `BREAKING CHANGE:` を記載する。

```
feat(compiler)!: テンプレート構文を v2 に変更

BREAKING CHANGE: <#for> の key 属性が必須になりました。
```

## バージョニング

[Semantic Versioning 2.0.0](https://semver.org/) に準拠。

```
v{MAJOR}.{MINOR}.{PATCH}
```

| バージョン | 意味 | 例 |
|---|---|---|
| MAJOR | 互換性のない変更 | 0.x → 1.0（v1 正式リリース） |
| MINOR | 後方互換の新機能追加 | 0.2.0 → 0.3.0 |
| PATCH | 後方互換のバグ修正 | 0.2.0 → 0.2.1 |

### v1.0 未満の運用

v1.0 未満（現在 v0.2.x）では MINOR が破壊的変更を含む可能性がある。

- `0.2.x → 0.2.y`: バグ修正・小さな改善
- `0.2.x → 0.3.0`: 新機能追加（keyed diff, dynamic slot など）
- `0.x → 1.0.0`: 安定版リリース（API 凍結）

### リリース手順

```bash
# 1. develop から release ブランチを作成
git checkout develop
git checkout -b release/v0.3.0

# 2. バージョン更新
npm version 0.3.0 --no-git-tag-version --workspaces
npm version 0.3.0 --no-git-tag-version

# 3. CHANGELOG 更新、最終テスト
npm test

# 4. main にマージ
git checkout main
git merge release/v0.3.0 --no-ff

# 5. タグ付け
git tag v0.3.0

# 6. npm publish
npm publish --workspaces

# 7. develop に main をマージバック
git checkout develop
git merge main
```

## npm パッケージ公開方針

### スコープ

全パッケージは `@aspect` スコープで公開する。

| パッケージ | npm 名 |
|---|---|
| chasket-cli | `@chasket/chasket` |
| chasket-ssr | `@chasket/chasket-ssr` |
| chasket-router | `@chasket/chasket-router` |
| chasket-store | `@chasket/chasket-store` |
| chasket-ui | `@chasket/chasket-ui` |
| chasket-lsp | `@chasket/chasket-lsp` |
| vite-plugin-chasket | `@chasket/vite-plugin-chasket` |

### 公開対象外

以下はリポジトリに含まれるが npm には公開しない。

- `chasket-vscode` — VS Code Marketplace で別途公開
- `chasket-compiler-rust` — 実験的実装、npm 対象外
- `chasket-docs` — ドキュメントサイトソース
- `examples/` — サンプルプロジェクト
- `test/` — ルートレベルのテスト

## 開発環境

- Node.js 22+
- 外部依存なし（全パッケージ zero-dependency）
- テスト: Node.js built-in test runner (`node --test`)
- lint: `node -c` による構文チェック
