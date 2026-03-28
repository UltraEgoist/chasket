# Chasket 技術学習ガイド

Chasket の内部構造、言語設計、セキュリティを体系的に学ぶためのガイドです。

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [コンパイラパイプライン詳解](#2-コンパイラパイプライン詳解)
3. [言語設計と制約](#3-言語設計と制約)
4. [Web Components の基礎知識](#4-web-components-の基礎知識)
5. [リアクティビティシステム](#5-リアクティビティシステム)
6. [差分DOM更新の仕組み](#6-差分dom更新の仕組み)
7. [セキュリティ設計](#7-セキュリティ設計)
8. [型システム](#8-型システム)
9. [学習課題](#9-学習課題)

---

## 1. アーキテクチャ概要

Chasket は**テンプレートファーストのコンパイラ**です。`.csk` ファイルを入力として受け取り、ブラウザがネイティブに実行できる Web Components の JavaScript コードを出力します。

```
.csk ファイル
    │
    ▼
┌─────────────┐
│  Split       │ ← 4ブロックに分割 (meta/script/template/style)
└─────┬───────┘
      ▼
┌─────────────┐
│  Parse       │ ← テンプレートをAST（抽象構文木）に変換
└─────┬───────┘
      ▼
┌─────────────┐
│  Type Check  │ ← 型チェック・静的解析・警告生成
└─────┬───────┘
      ▼
┌─────────────┐
│  Code Gen    │ ← Web Component (JS/TS) コードを生成
└─────┬───────┘
      ▼
  .js / .ts ファイル
```

**重要な設計判断:**

- **ランタイムライブラリなし**: 生成コードは標準のWeb Components APIのみ使用。React/Vue のようなランタイムフレームワークに依存しない
- **ビルド時にすべて解決**: テンプレート構文はビルド時にJavaScriptに変換される。ブラウザではネイティブJS+DOMのみ実行
- **1ファイル = 1コンポーネント**: SFC (Single File Component) パターン

---

## 2. コンパイラパイプライン詳解

### Phase 1: splitBlocks — ブロック分割

ソースコードを正規表現で4つのセクションに分割します。

```javascript
// 入力
const source = `
<meta>name: "x-hello"</meta>
<script>state msg: string = "Hi"</script>
<template><p>{{ msg }}</p></template>
<style>p { color: blue; }</style>
`;

// 出力
{
  meta: 'name: "x-hello"',
  script: 'state msg: string = "Hi"',
  template: '<p>{{ msg }}</p>',
  style: 'p { color: blue; }'
}
```

**学習ポイント:**
- 正規表現によるタグ抽出: `/<meta>([\s\S]*?)<\/meta>/`
- `[\s\S]*?` は非貪欲マッチで改行を含む最短一致
- CRLF → LF の正規化で異なるOS間の互換性を確保

### Phase 2: parseTemplateNodes — テンプレートパース

HTML文字列をAST（抽象構文木）に変換します。これは**再帰下降パーサー**の実装です。

```javascript
// 入力: '<p>{{ msg }}</p>'
// 出力AST:
[{
  kind: 'element',
  tag: 'p',
  attrs: [],
  children: [{
    kind: 'interpolation',
    expr: 'msg'
  }]
}]
```

**パーサーが処理する構文:**

| 構文 | ASTノード種別 | 処理方法 |
|------|-------------|---------|
| `<div>...</div>` | `element` | タグ名+属性を抽出、子ノードを再帰パース |
| `{{ expr }}` | `interpolation` | `{{` と `}}` で囲まれた式を抽出 |
| `テキスト` | `text` | タグ間のプレーンテキスト |
| `<#if cond="...">` | `if_block` | 条件式を抽出、body/else/else-if を再帰パース |
| `<#for each="..." of="...">` | `for_block` | ループ変数・配列式・キーを抽出 |

**学習ポイント:**
- 再帰下降パーサー: 各ノード種別に対応するパース関数があり、互いに再帰的に呼び出す
- ネスト処理: `<#if>` の中に `<#for>` を入れる場合、パーサーが正しくスコープを管理する
- エラー復帰: 不正なHTMLでもクラッシュせず、エラーノードを返してパースを継続

### Phase 3: TypeChecker — 型チェック

ASTとscript宣言を走査し、型の不一致や未定義変数を検出します。

```
state count: number = 0        → シンボルテーブルに登録: { name: "count", type: "number" }
state name: string = "hello"   → シンボルテーブルに登録: { name: "name", type: "string" }

テンプレート内の {{ count.toUpperCase() }}
  → "count" は number 型
  → toUpperCase() は string のメソッド
  → エラー E0302: 型 'number' にメソッド 'toUpperCase' は存在しません
```

**シンボルテーブル:** コンパイラが変数名とその型情報を管理するデータ構造。プログラミング言語のコンパイラでは必須の概念。

**学習ポイント:**
- Levenshtein距離: 未定義変数に対して「もしかして '...' ですか？」と類似名を提案
- 宣言順序の検証: computed が前に宣言された state を参照しているか
- 未使用変数の検出: 宣言されたが一度も使われていない state に警告

### Phase 4: CodeGen — コード生成

ASTとメタ情報からJavaScript クラスを生成します。

```javascript
// 入力: state count: number = 0, template: <p>{{ count }}</p>, @click="increment"

// 生成コード（簡略化）:
class XHello extends HTMLElement {
  #shadow;
  #listeners = [];
  #count = 0;              // state → private field

  connectedCallback() {
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();         // 初回レンダリング
    this.#bindEvents();     // イベント登録
  }

  #render() {               // フルレンダリング（初回のみ）
    const tpl = document.createElement('template');
    tpl.innerHTML = `<p>${this.#esc(this.#count)}</p>`;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {           // 差分更新用の新しいDOMツリー生成
    const tpl = document.createElement('template');
    tpl.innerHTML = `<p>${this.#esc(this.#count)}</p>`;
    return tpl.content;
  }

  #patch(parent, newContent) { // DOM差分パッチ
    // ... morphdom-lite アルゴリズム
  }

  #update() {               // 差分更新（state変更時）
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
  }
}
```

**変数変換ルール:**

| Chasket 構文 | 生成コード | 説明 |
|------------|-----------|------|
| `state count` | `this.#count` | プライベートフィールド |
| `prop label` | `this.#prop_label` | プライベート + getter |
| `computed total` | `get total()` | getter メソッド |
| `fn increment()` | `#increment()` | プライベートメソッド |
| `emit change` | `#emit_change()` | CustomEvent dispatch |
| `ref canvas` | `this.#canvas` | querySelector参照 |

---

## 3. 言語設計と制約

### Chasket が採用している設計パターン

**1. 宣言的テンプレート**
テンプレートは「何を表示するか」を宣言します。「どう更新するか」はコンパイラが自動生成します。

```html
<!-- 宣言的: 「countの値を表示する」 -->
<p>{{ count }}</p>

<!-- 命令的（これは書かない）: 「DOMを直接操作する」 -->
<!-- document.querySelector('p').textContent = count; -->
```

**2. 単方向データフロー + 明示的双方向バインド**
state → テンプレート は自動。テンプレート → state は `:bind` で明示的に宣言。

**3. コンパイル時型安全性**
型注釈により、実行前にバグを検出。TypeScript と同じアプローチ。

### 言語的な制約

| 制約 | 理由 |
|------|------|
| コンポーネント名にハイフン必須 | Web Components 仕様（HTMLElement と区別） |
| `<template>` ブロック必須 | 表示なしのコンポーネントは無意味 |
| state は直接代入でのみ更新 | リアクティビティの追跡を単純化 |
| fn 内で `this` を直接書かない | コンパイラが `this.#xxx` に変換するため |
| import は構文のみ対応 | モジュールバンドラーとの統合が前提 |
| ジェネリック型は未対応 | 型チェッカーの複雑性を制限 |

### Chasket vs 他フレームワークの比較

| 特性 | Chasket | React | Vue | Svelte |
|------|-------|-------|-----|--------|
| ランタイム | なし | 仮想DOM | 仮想DOM | ミニマル |
| コンパイル | JS生成 | JSX変換 | SFC変換 | JS生成 |
| DOM更新 | 差分パッチ | 仮想DOM差分 | 仮想DOM差分 | 反応的更新 |
| コンポーネント基盤 | Web Components | 独自 | 独自 | 独自 |
| 型システム | 組み込み | TypeScript外付け | TypeScript外付け | TypeScript外付け |
| スタイル | Shadow DOM/Scoped | CSS Modules等 | Scoped CSS | Scoped CSS |

---

## 4. Web Components の基礎知識

Chasket は Web Components 標準の上に構築されています。理解すべき基本概念:

### Custom Elements

ブラウザに新しいHTML要素を登録する仕組み。

```javascript
class MyElement extends HTMLElement {
  constructor() { super(); }
  connectedCallback() { /* DOMに追加された時 */ }
  disconnectedCallback() { /* DOMから削除された時 */ }
  attributeChangedCallback(name, oldVal, newVal) { /* 属性が変更された時 */ }
  static get observedAttributes() { return ['label']; } // 監視する属性
}
customElements.define('my-element', MyElement);
```

**Chasket はこのボイラープレートをすべて自動生成します。**

### Shadow DOM

要素の内部DOMを外部から隠蔽する仕組み。CSSも隔離される。

```javascript
const shadow = this.attachShadow({ mode: 'open' });
shadow.innerHTML = '<p>This is encapsulated</p>';
// 外部CSSは影響しない、内部CSSは外に漏れない
```

| モード | 外部からのアクセス | Chasket での指定 |
|--------|------------------|---------------|
| `open` | `element.shadowRoot` でアクセス可 | `shadow: open` (デフォルト) |
| `closed` | アクセス不可 | `shadow: closed` |
| なし | Shadow DOM を使わない | `shadow: none` |

### Slot

親コンポーネントから子コンポーネントにコンテンツを注入する仕組み。

```html
<!-- 子コンポーネントの定義 -->
<slot></slot>                    <!-- デフォルトスロット -->
<slot name="header"></slot>      <!-- 名前付きスロット -->

<!-- 親からの使用 -->
<x-card>
  <h1 slot="header">タイトル</h1>
  <p>メインコンテンツ</p>
</x-card>
```

---

## 5. リアクティビティシステム

### データフロー

```
state 変更
    │
    ▼
#update() 呼び出し
    │
    ├─→ イベントリスナー解除
    ├─→ #getNewTree() で新しいDOMフラグメント生成
    ├─→ #patch() で既存DOMとの差分を適用
    ├─→ #bindEvents() でイベント再登録
    └─→ #bindRefs() でDOM参照を更新
```

### なぜ毎回イベントリスナーを再登録するのか？

差分パッチングは既存のDOM要素を再利用しますが、テンプレートリテラル内のクロージャが古いstateを参照する可能性があります。イベントハンドラを再登録することで、最新のstateを参照するクロージャに更新します。

```javascript
// 1回目のbindEvents: countは0
const fn = (e) => { this.#count = this.#count + 1; this.#update(); };
// → this.#count は最新値を参照するので実際は問題ない
// しかし、#for ループ内ではクロージャのindex変数が古くなる可能性がある
```

### :bind の双方向バインディング

```
ユーザー入力 → input イベント → state 更新 → #update() → DOM差分更新
                                                            ↑
                                            フォーカスとカーソルは保持
```

---

## 6. 差分DOM更新の仕組み

### morphdom-lite アルゴリズム

Chasket の `#patch()` メソッドは morphdom ライブラリの簡易版です。

```
既存DOM:  <div><p>Hello</p><span>World</span></div>
新DOM:    <div><p>Hi</p><span>Chasket</span><em>!</em></div>

パッチ処理:
1. <div> ↔ <div>  → タグ同一、子ノードを再帰比較
2. <p> ↔ <p>      → タグ同一、テキスト "Hello" → "Hi" に更新
3. <span> ↔ <span> → タグ同一、テキスト "World" → "Chasket" に更新
4. なし ↔ <em>    → 新ノードを appendChild で追加
```

**パッチルール:**

| ケース | 処理 |
|--------|------|
| oldがあり、newがない | `parent.removeChild(old)` |
| oldがなく、newがある | `parent.appendChild(new.cloneNode(true))` |
| nodeType/tagが異なる | `parent.replaceChild(new, old)` |
| テキストノード | `textContent` のみ更新 |
| 要素ノード | 属性を差分更新 → 子ノードを再帰パッチ |

**なぜ仮想DOMではなく実DOMの差分なのか:**
- 仮想DOMは仮想ノードオブジェクトの生成コストがかかる
- Chasketの方式は `template.innerHTML` で直接DOMフラグメントを生成し、実DOMと比較
- シンプルだが、大量の動的ノードでは仮想DOMに比べて効率が劣る場合がある

---

## 7. セキュリティ設計

### 多層防御（Defense in Depth）

```
ユーザー入力
    │
    ▼
{{ expr }}  ─────→  #esc()     → HTML テキストエスケープ (&, <, >, ", ')
    │
:attr="expr" ───→  #escAttr() → 属性値エスケープ (+ バッククォート, 改行)
    │
:href="expr" ───→  #escUrl()  → URLプロトコル検証 + 属性エスケープ
    │
@html="expr" ───→  エスケープなし（開発者の責任）
```

### XSS (Cross-Site Scripting) 防御

**テキストエスケープ (#esc):**

```javascript
// 入力: <script>alert(1)</script>
// 出力: &lt;script&gt;alert(1)&lt;/script&gt;
// ブラウザはHTMLタグとして解釈しない
```

**属性エスケープ (#escAttr):**

```javascript
// 入力: " onclick="alert(1)
// 出力: &quot; onclick=&quot;alert(1)
// 属性値の文脈から脱出できない
```

**URLサニタイズ (#escUrl):**

```javascript
// 入力: javascript:alert(1)
// 出力: about:blank
//
// エンコード回避も防御:
// 入力: java%73cript:alert(1)
// → デコード → javascript:alert(1) → about:blank
```

### CSS インジェクション防御

`shadow: none` モード時、CSS セレクタに `[data-chasket-scope]` を自動付与:

```css
/* 入力 */
.button { color: red; }
:host { display: block; }

/* 出力 (shadow: none) */
[data-chasket-scope="x-my-comp"] .button { color: red; }
[data-chasket-scope="x-my-comp"] { display: block; }
```

tagName は `[^a-z0-9-]` を除去してサニタイズ。CSSセレクタインジェクションを防止。

### 既知のセキュリティ制限

1. **@html は危険**: エスケープをバイパスするため、ユーザー入力を絶対に渡さない
2. **.csk ファイル自体は信頼前提**: 攻撃者が .csk を書ける場合、任意コード実行可能
3. **dev server はローカル専用**: 本番ホスティングには使用しない
4. **イベントハンドラ式の検証が不完全**: 複雑な式でのコードインジェクションリスクあり

---

## 8. 型システム

### サポートする型

```
// プリミティブ型
state name: string = ""
state count: number = 0
state active: boolean = false

// 配列型
state items: string[] = []
state matrix: number[][] = []

// オブジェクト型
state user: { name: string, age: number } = { name: "", age: 0 }

// ユニオン型
state status: "idle" | "loading" | "done" = "idle"

// リテラル型
state mode: "dark" | "light" = "light"

// オプショナルフィールド
state config: { debug?: boolean, timeout: number } = { timeout: 3000 }

// 型エイリアス
type User = { name: string, age: number }
state user: User = { name: "", age: 0 }
```

### 型チェックの仕組み

```
1. 宣言をパース → シンボルテーブルに登録
2. 初期値の型を推論 → 宣言型と比較
3. テンプレートの式を走査 → シンボルテーブルで検索
4. メソッド呼び出しを検証 → 型に応じた許可メソッドリスト
5. 未使用変数を警告
```

**現在の制約:**
- ジェネリック型（`Array<T>`）は未対応
- 関数型（`(x: number) => string`）は未対応
- 型推論は初期値からの単純推論のみ
- 構造的部分型チェック（structural subtyping）は未対応

---

## 9. 学習課題

### 初級: コンパイラの動作を理解する

1. **splitBlocks を手動でトレース**: 簡単な .csk ファイルを用意し、正規表現がどのブロックを抽出するか手で確認する
2. **生成コードを読む**: `chasket build` で生成された .js ファイルを読み、元の .csk との対応関係を理解する
3. **テストを実行する**: `node --test chasket-cli/test/compiler.test.js` を実行し、各テストが何を検証しているか読む

### 中級: 機能を追加してみる

4. **新しいイベント修飾子を追加**: 例えば `|once` (一度だけ発火) を実装する。codegen のイベントバインディング部分を修正
5. **新しい型を追加**: 例えば `Map<string, number>` を型チェッカーに追加する
6. **新しい template ディレクティブを追加**: 例えば `<#switch>` / `<#case>` を実装する

### 上級: セキュリティを検証する

7. **XSS ペイロードテスト**: 各エスケープ関数に対して OWASP XSS チートシートのペイロードを試す
8. **ファズテスト**: ランダムな .csk ファイルを生成してコンパイラに投入し、クラッシュやハングを検出する
9. **txSafe() のエッジケース**: テンプレートリテラル内のネストした `${}` に複雑な式を入れてバグを探す

### 参考資料

- [Web Components MDN](https://developer.mozilla.org/ja/docs/Web/API/Web_components)
- [Custom Elements 仕様](https://html.spec.whatwg.org/multipage/custom-elements.html)
- [Shadow DOM 仕様](https://dom.spec.whatwg.org/#shadow-trees)
- [morphdom アルゴリズム](https://github.com/patrick-steele-idem/morphdom)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Scripting_Prevention_Cheat_Sheet.html)
