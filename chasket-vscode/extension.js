/**
 * Chasket VS Code Extension v0.2.0
 *
 * このVS Code拡張機能は、Chasketコンポーネント言語に対する統合開発環境サポートを提供します。
 *
 * 主な機能:
 * - **リアルタイム診断**: state, prop, computed, fn, emit, ref などの宣言を検証
 * - **ホバードキュメント**: キーワードや宣言にカーソルを当てると詳細情報を表示
 * - **自動補完**: スクリプトディレクティブ（state, fn など）とテンプレート構文をサポート
 * - **定義へのジャンプ**: 識別子をクリックして宣言位置に移動
 * - **ドキュメント アウトライン**: 右側パネルにコンポーネント構造を表示
 *
 * 内部データ構造:
 * - {@link documentSymbols} - ドキュメントURIごとのシンボル表（変数、関数、プロパティなど）
 * - {@link documentHashes} - インクリメンタル解析用のコンテンツハッシュ
 * - {@link diagnosticCollection} - VS Code診断コレクション（エラー・警告の表示）
 *
 * シンボル表の構造: { name: string, type: string, source: string, line: number, doc?: string, ... }
 * - name: 識別子名
 * - type: 型注釈（"number", "string[]" など）
 * - source: 宣言タイプ（"state", "prop", "fn", "emit" など）
 * - line: 宣言のあるドキュメント行番号（1-indexed）
 * - doc: JSDocコメント（スラッシュ-アスタリスク形式のコメント内容）
 */

// ============================================================
// Chasket VS Code Extension v0.2.0
// ============================================================

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// ── LSP Client (optional — falls back to inline providers if unavailable) ──
let lspClient = null;

/**
 * LSPサーバーの起動を試行
 * vscode-languageclient が利用可能な場合のみ LSP モードで動作
 * @param {vscode.ExtensionContext} context
 * @returns {boolean} LSP モードで起動できたかどうか
 */
function tryStartLspClient(context) {
  try {
    const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
    const serverModule = path.join(__dirname, '..', 'chasket-lsp', 'server.js');
    if (!fs.existsSync(serverModule)) return false;

    const serverOptions = {
      run: { module: path.join(__dirname, '..', 'chasket-lsp', 'bin', 'chasket-lsp.js'), transport: TransportKind.stdio },
      debug: { module: path.join(__dirname, '..', 'chasket-lsp', 'bin', 'chasket-lsp.js'), transport: TransportKind.stdio },
    };

    const clientOptions = {
      documentSelector: [{ scheme: 'file', language: 'chasket' }],
      initializationOptions: {
        compilerPath: vscode.workspace.getConfiguration('chasket').get('compilerPath') || '',
      },
    };

    lspClient = new LanguageClient('chasket-lsp', 'Chasket Language Server', serverOptions, clientOptions);
    lspClient.start();
    context.subscriptions.push({ dispose: () => lspClient?.stop() });
    return true;
  } catch {
    // vscode-languageclient not installed — fall back to inline providers
    return false;
  }
}

/** @type {vscode.DiagnosticCollection} VS Code診断コレクション（エラー・警告・情報を管理） */
let diagnosticCollection;

/**
 * ドキュメントごとのシンボル表
 * キー: ドキュメントURI、値: Map<識別子名, シンボルメタデータ>
 *
 * シンボルメタデータ: { type, source, line, doc, init?, expr?, params?, async?, options? }
 * - type: 型注釈
 * - source: "state" | "prop" | "computed" | "fn" | "emit" | "ref" | "provide" | "consume"
 * - line: 宣言行番号（1-indexed）
 * - doc: JSDocコメント（スラッシュ-アスタリスク形式）
 * - init: 初期値（state, prop, provide用）
 * - expr: 計算式（computed用）
 * - params: 関数パラメータリスト（fn用）
 * - async: 非同期フラグ（fn用）
 * - options: emit修飾子（emit用）
 * @type {Map<string, Map<string, Object>>}
 */
const documentSymbols = new Map();

/**
 * コンテンツハッシュキャッシュ（インクリメンタル解析用）
 * P2-54: 同じ内容のドキュメントは再解析をスキップ
 * キー: ドキュメントURI、値: djb2ハッシュ値
 * @type {Map<string, string>}
 */
const documentHashes = new Map();

/**
 * 拡張機能のアクティベーション（初期化）
 *
 * 以下の処理を実行:
 * 1. 診断コレクションの作成
 * 2. 言語プロバイダーの登録（ホバー、補完、定義、シンボル）
 * 3. テキストドキュメントイベントリスナーの設定
 * 4. 現在開いているすべてのChasketドキュメントの診断実行
 *
 * @param {vscode.ExtensionContext} context - 拡張機能コンテキスト
 * @returns {void}
 */
function activate(context) {
  // LSPモードの試行 — 成功すれば LSP サーバーが全機能を提供
  const useLsp = tryStartLspClient(context);
  if (useLsp) {
    // LSP モードでは inline プロバイダーは不要（LSPサーバーが提供）
    // ただし構文ハイライトとファイルアイコンは TextMate grammar で引き続き提供
    return;
  }

  // ── Inline モード（LSP unavailable）── 既存の全プロバイダーを登録
  // 拡張ロード時にキャッシュをクリア（更新後のリロードで古い診断が残るのを防止）
  documentHashes.clear();
  documentSymbols.clear();

  // 診断コレクションを作成し、拡張機能がクリーンアップ時に自動処理するよう登録
  diagnosticCollection = vscode.languages.createDiagnosticCollection('chasket');
  context.subscriptions.push(diagnosticCollection);

  /**
   * デバウンス処理：テキスト変更時の診断を300ms遅延実行
   * 理由: ユーザーが高速に入力中に毎回診断すると重くなるため
   * @type {number|null}
   */
  let diagTimer = null;
  function debouncedDiag(doc) {
    if (diagTimer) clearTimeout(diagTimer);
    diagTimer = setTimeout(() => runDiagnostics(doc), 300);
  }

  // ── イベントリスナー登録 ──
  context.subscriptions.push(
    // ファイル保存時：即座に診断実行
    vscode.workspace.onDidSaveTextDocument(doc => { if (doc.languageId === 'chasket') runDiagnostics(doc); }),
    // ファイル開時：初期診断実行
    vscode.workspace.onDidOpenTextDocument(doc => { if (doc.languageId === 'chasket') runDiagnostics(doc); }),
    // テキスト変更時：デバウンス処理で診断実行
    vscode.workspace.onDidChangeTextDocument(e => { if (e.document.languageId === 'chasket') debouncedDiag(e.document); }),
    // アクティブエディタ変更時：診断実行
    vscode.window.onDidChangeActiveTextEditor(ed => { if (ed?.document.languageId === 'chasket') runDiagnostics(ed.document); }),
    // ドキュメント閉時：キャッシュクリア
    vscode.workspace.onDidCloseTextDocument(doc => { diagnosticCollection.delete(doc.uri); documentSymbols.delete(doc.uri.toString()); })
  );

  // ── 言語プロバイダー登録 ──
  // ホバードキュメント: カーソル位置の識別子情報を表示
  context.subscriptions.push(vscode.languages.registerHoverProvider('chasket', { provideHover }));
  // 自動補完: キーワード（state, fn等）とテンプレート構文をサジェスト
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('chasket', { provideCompletionItems }));
  // 定義へのジャンプ: 識別子をクリックして宣言位置に移動
  context.subscriptions.push(vscode.languages.registerDefinitionProvider('chasket', { provideDefinition }));
  // ドキュメント アウトライン: 右側パネルにコンポーネント構造を表示
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('chasket', { provideDocumentSymbols }));

  // 既に開いているChasketドキュメントに対して初期診断を実行
  vscode.workspace.textDocuments.forEach(doc => { if (doc.languageId === 'chasket') runDiagnostics(doc); });
}

/**
 * 拡張機能のディアクティベーション（クリーンアップ）
 *
 * VS Codeが拡張機能をアンロードする際に呼び出されます。
 * リソースをクリーンアップします。
 *
 * @returns {void}
 */
function deactivate() {
  // LSPクライアント停止
  if (lspClient) { lspClient.stop(); lspClient = null; }
  // 診断コレクションを破棄（メモリ解放、リソース確保）
  diagnosticCollection?.dispose();
}

// ═══════════════════════════════════════════
// HOVER DOCS
// ═══════════════════════════════════════════

const HOVER = {
  // ── Script declarations ──
  'state': '**state** — リアクティブ変数\n\n内部状態を宣言します。値を変更するとテンプレートが自動更新されます。\n\n```chasket\nstate count: number = 0\nstate name: string = "hello"\nstate items: string[] = []\n```\n\n型注釈と初期値が必須です。',
  'const': '**const** — 非リアクティブ定数\n\nコンポーネント内で使用するプライベート定数を宣言します。\n値の変更はDOMに反映されません。\n\n```chasket\nconst MAX_COUNT = 100\nconst API_URL: string = "https://api.example.com"\nconst handler = () => console.log("click")\n```\n\n型注釈は省略可能。イベントハンドラとしても使えます: `@click="handler"`',
  'let': '**let** — 非リアクティブ変数\n\nコンポーネント内で使用するプライベート変数を宣言します。\n値の変更はDOMに反映されません（stateとの違い）。\n\n```chasket\nlet counter = 0\nlet cache: object = {}\n```\n\n型注釈は省略可能。DOM更新が不要な内部状態に使います。',
  'prop': '**prop** — 外部属性\n\n親から受け取る属性を宣言します。HTML属性として反映・監視されます。\n\n```chasket\nprop label: string               // 必須\nprop size: number = 16            // デフォルト付き\nprop disabled: boolean = false\n```\n\n型による反映: `string` → getAttribute, `number` → parseFloat, `boolean` → 属性の有無',
  'computed': '**computed** — 派生値\n\nstate/propから自動計算される読み取り専用の値です。依存値が変わると再計算されます。\n\n```chasket\ncomputed total: number = items.reduce((s, i) => s + i.price, 0)\ncomputed isValid: boolean = name.length > 0\n```',
  'fn': '**fn** — 関数定義\n\nコンポーネントのプライベートメソッドを定義します。\n内部でstateを変更するとDOMが自動更新されます。\n\n```chasket\nfn increment() {\n  count += 1\n}\n\nfn greet(name: string): string {\n  return `Hello, ${name}!`\n}\n\nfn async fetchData() {\n  data = await fetch("/api").then(r => r.json())\n}\n```\n\n**コンパイル結果**: `fn` はクラスの **private メソッド** (`#name()`) に変換されます。\n`this` はコンポーネントインスタンスを指します（Arrow関数ではありません）。\n\n**イベントハンドラとして使う場合**:\n- `@click="increment"` → `(e) => { this.#increment(e); this.#update(); }` に展開\n- ハンドラには `e` (イベントオブジェクト) が自動的に第1引数として渡されます\n- `state` 変数に関数を格納して渡すことも可能です',
  'emit': '**emit** — カスタムイベント\n\n親へ通知するイベントを宣言します。CustomEventとしてdispatchされます。\n\n```chasket\nemit close: { reason: string }        // デフォルト (bubbles+composed)\nemit(bubbles) notify: void             // バブリングのみ\nemit(composed) select: { id: number }  // Shadow DOM越えのみ\nemit(local) internal: void             // 自身のみ\n```\n\nオプション: `bubbles`, `composed`, `local`\n省略時: `bubbles: true, composed: true`',
  'ref': '**ref** — DOM参照\n\nテンプレート内のDOM要素への直接参照を取得します。\n\n```chasket\nref canvas: HTMLCanvasElement\n\non mount {\n  const ctx = canvas.getContext("2d")\n}\n```\n\nテンプレート側: `<canvas ref="canvas" />`',
  'watch': '**watch** — 副作用\n\n値の変更時にDOM以外の副作用を実行します。\n\n```chasket\nwatch(count) {\n  localStorage.setItem("count", String(count))\n}\n```',
  'provide': '**provide** — コンテキスト提供\n\n子孫コンポーネントにデータを提供します。\n\n```chasket\nprovide theme: Theme = { mode: "dark" }\n```',
  'consume': '**consume** — コンテキスト受信\n\n祖先の `provide` からデータを受信します。\n\n```chasket\nconsume theme: Theme\n```',
  'on': '**on** — ライフサイクルフック\n\n```chasket\non mount {          // connectedCallback\n  // 初期化処理\n  return () => {}   // クリーンアップ（unmount時に実行）\n}\n\non unmount {        // disconnectedCallback\n}\n\non update(label) {  // attributeChangedCallback\n}\n```',
  'import': '**import** — インポート\n\n他のChasketコンポーネントやTS/JSモジュールを読み込みます。\n\n```chasket\nimport XButton from "./button.csk"\nimport { formatDate } from "./utils.ts"\n```\n\nバンドル内ではタグ名で自動参照されるため、import文は省略可能ですが、\n将来のコンパイル時型チェックのために記述を推奨します。',
  'type': '**type** — 型エイリアス\n\nTypeScript互換の型定義です。\n\n```chasket\ntype User = { name: string, age: number, email?: string }\ntype Status = "idle" | "loading" | "error"\ntype Result<T> = { ok: true, data: T } | { ok: false, error: string }\n```',
  'async': '**async** — 非同期関数\n\n`fn async` で非同期関数を定義します。\n\n```chasket\nfn async fetchUser(id: string) {\n  user = await fetch(`/api/users/${id}`).then(r => r.json())\n}\n```',
  ':else-if': '**:else-if** — else-if 分岐\n\n`#if` ブロック内で追加の条件分岐を指定します。\n\n```chasket\n<#if condition="status === \'ok\'">\n  <p>成功</p>\n<:else-if condition="status === \'loading\'">\n  <p>読み込み中...</p>\n<:else>\n  <p>エラー</p>\n</#if>\n```',

  // ── Template directives ──
  '#if': '**#if** — 条件分岐\n\n```chasket\n<#if condition="user != null">\n  <p>{{ user.name }}</p>\n<:else-if condition="isLoading">\n  <p>読み込み中...</p>\n<:else>\n  <p>ログインしてください</p>\n</#if>\n```\n\n必須: `condition` 属性',
  '#for': '**#for** — ループ\n\n```chasket\n<#for each="item" of="items" key="item.id">\n  <li>{{ item.name }}</li>\n</#for>\n\n// インデックス付き\n<#for each="item, index" of="items" key="item.id">\n  <li>{{ index + 1 }}. {{ item.name }}</li>\n  <:empty>\n    <p>空です</p>\n  </:empty>\n</#for>\n```\n\n必須: `each`, `of`, `key`',

  // ── Directive attributes ──
  'each': '**each** — ループ変数名 (#for 必須)\n\n各要素を受け取る変数名。カンマでインデックスも取得可能。\n\n```\neach="item"          // 要素のみ\neach="item, index"   // 要素 + インデックス\n```',
  'of': '**of** — ループ対象の配列 (#for 必須)\n\nstate/propの配列名を指定します。\n\n```\nof="items"    // state items をループ\n```',
  'key': '**key** — 一意キー (#for 必須)\n\n各アイテムを識別するキー式。DOM更新の効率化に必須。\n\n```\nkey="item.id"   // オブジェクトのIDフィールド\nkey="item"      // プリミティブ値そのもの\n```',
  'condition': '**condition** — 条件式 (#if 必須)\n\nJavaScript式として評価されます。\n\n```\ncondition="user != null"\ncondition="count > 0"\ncondition="status === \'loading\'"\n```',

  // ── Template attributes ──
  ':bind': '**:bind** — 双方向バインディング\n\nフォーム要素とstateを同期します。\n\n```chasket\n<input :bind="name" />\n<textarea :bind="desc" />\n<select :bind="selected">...</select>\n```\n\nvalue属性 + input/changeイベントに展開されます。',
  ':class': '**:class** — 動的クラス\n\n```chasket\n<div :class="{ active: isActive, bold: isBold }">\n<div :class="[base, isActive && \'active\']">\n```',
  ':style': '**:style** — 動的スタイル\n\n```chasket\n<div :style="{ color: textColor, fontSize: `${size}px` }">\n```',
  '@html': '**@html** — 生HTML注入\n\n⚠️ エスケープされません。XSSリスクに注意。\n\n```chasket\n<div @html="richContent"></div>\n```\n\n通常の `{{ }}` は自動エスケープされます。',
  'slot': '**slot** — スロット\n\nWeb Component標準。親からコンテンツを挿入できます。\n\n```chasket\n// 子: <slot>デフォルト</slot>\n// 子: <slot name="header"></slot>\n// 親: <x-card><h2 slot="header">タイトル</h2></x-card>\n```',

  // ── Meta fields ──
  'name': '**name** — カスタム要素タグ名\n\nハイフンを1つ以上含む必要があります。\n\n```chasket\n<meta>\n  name: "x-button"\n</meta>\n```\n\n省略時はファイル名から自動生成されます。',
  'shadow': '**shadow** — Shadow DOMモード\n\n```\nshadow: open     // 外部からアクセス可能（デフォルト）\nshadow: closed   // 外部からアクセス不可\nshadow: none     // Shadow DOM不使用\n```\n\n`none` はTailwind等の外部CSSと併用する場合に便利です。',
  'form': '**form** — フォーム連携\n\nコンポーネントをForm-Associated Custom Elementにします。\n\n```chasket\n<meta>\n  name: x-input\n  form: true\n</meta>\n```\n\n有効にすると:\n- `setFormValue(value)` でフォーム値を設定\n- `setValidity(flags, message)` でバリデーション\n- `on formReset { }` 等のフォームライフサイクル使用可\n- `form`, `validity`, `checkValidity()` 等のAPI自動公開',
  'generic': '**generic** — ジェネリック型パラメータ\n\nコンポーネントに型パラメータを宣言し、再利用可能な型安全コンポーネントを作成。\n\n```chasket\n<meta>\n  name: x-list\n  generic: T\n</meta>\n\n<script>\n  state items: T[] = []\n  prop renderer: (item: T) => string = String\n</script>\n```\n\n制約付きパラメータ:\n```chasket\ngeneric: T extends string, U = number\n```\n\n`.d.ts` 出力にジェネリックが反映されます。',

  // ── Form lifecycle ──
  'formReset': '**on formReset** — フォームリセット\n\nフォームの `reset` 時に呼ばれます。初期値への復元処理を記述。\n\n```chasket\non formReset {\n  value = ""\n  setFormValue("")\n}\n```',
  'formAssociated': '**on formAssociated** — フォーム関連付け\n\nコンポーネントが `<form>` に関連付けられた時に呼ばれます。\n\n```chasket\non formAssociated {\n  // form がセットされた\n}\n```',
  'formDisabled': '**on formDisabled** — フォーム無効化\n\n`<fieldset disabled>` 等でフォーム要素が無効化された時に呼ばれます。\n\n```chasket\non formDisabled {\n  // disabled 状態の処理\n}\n```',
  'formStateRestore': '**on formStateRestore** — フォーム状態復元\n\nブラウザによるフォーム状態の自動復元時に呼ばれます。\n\n```chasket\non formStateRestore {\n  // state, mode が引数として渡される\n}\n```',
  'setFormValue': '**setFormValue** — フォーム値設定\n\n`form: true` 時に使用可能。`ElementInternals.setFormValue()` を呼びます。\n\n```chasket\nsetFormValue(value)          // 文字列\nsetFormValue(value, state)   // 値とブラウザ復元用状態\nsetFormValue(formData)       // FormDataオブジェクト\n```',
  'setValidity': '**setValidity** — バリデーション設定\n\n`form: true` 時に使用可能。`ElementInternals.setValidity()` を呼びます。\n\n```chasket\nsetValidity({ valueMissing: true }, "入力必須です")\nsetValidity({})              // バリデーションをクリア\n```',
};

/**
 * カーソル位置がどのブロック内にあるかを判定する
 *
 * .csk ファイルの4ブロック（meta, script, template, style）のうち
 * どのブロックにカーソルがあるかを返します。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {number} lineNumber - カーソル行番号（0-based）
 * @returns {'meta'|'script'|'template'|'style'|null} ブロック名
 */
function detectBlock(document, lineNumber) {
  let currentBlock = null;
  for (let i = 0; i <= lineNumber; i++) {
    const t = document.lineAt(i).text.trim();
    if (t === '<meta>' || t.startsWith('<meta ')) currentBlock = 'meta';
    else if (t === '</meta>') currentBlock = null;
    else if (t === '<script>' || t.startsWith('<script ')) currentBlock = 'script';
    else if (t === '</script>') currentBlock = null;
    else if (t === '<template>' || t.startsWith('<template ')) currentBlock = 'template';
    else if (t === '</template>') currentBlock = null;
    else if (t === '<style>' || t.startsWith('<style ')) currentBlock = 'style';
    else if (t === '</style>') currentBlock = null;
  }
  return currentBlock;
}

// メタブロック専用キーワード — <script>内ではユーザー定義シンボルを優先
const META_ONLY_HOVER_KEYS = new Set(['name', 'shadow', 'form', 'generic']);

/**
 * ホバードキュメントプロバイダー
 *
 * カーソル位置の単語に関する情報をマークダウン形式で表示します。
 * 以下の場合を処理:
 * 1. キーワード（state, fn, import 等）→ スクリプト構文の説明
 * 2. テンプレートディレクティブ（#if, #for, :bind 等）→ テンプレート構文の説明
 * 3. ユーザー定義シンボル（state, fn, computed等の宣言）→ 型情報とJSDocコメント
 * 4. イベントハンドラ（@click, @input 等）→ 修飾子情報を含む説明
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {vscode.Position} position - ホバー位置
 * @returns {vscode.Hover|null} ホバー情報、または見つからなければnull
 */
function provideHover(document, position) {
  const line = document.lineAt(position).text;

  // ── 単語範囲の決定 ──
  // @eventリスナーや:bindディレクティブの修飾子付きキーワードに対応
  // 例: @click|once, :bind-label
  let wordRange = document.getWordRangeAtPosition(position, /[@:#][\w-]+(?:\|[\w]+)*/);
  if (!wordRange) wordRange = document.getWordRangeAtPosition(position, /[\w]+/);
  if (!wordRange) return null;
  const word = document.getText(wordRange);

  // ── 直接マッチ（キーワード辞書） ──
  // HOVERオブジェクトにある標準キーワードの説明を返す
  // ただし 'name', 'shadow' 等のメタ専用キーワードは <meta> ブロック内でのみ表示
  // <script> 内ではユーザー定義シンボル（prop name 等）を優先する
  if (HOVER[word]) {
    if (!META_ONLY_HOVER_KEYS.has(word)) {
      return mkHover(HOVER[word], wordRange);
    }
    // メタ専用キーワードは <meta> ブロック内のみマッチ
    const block = detectBlock(document, position.line);
    if (block === 'meta') {
      return mkHover(HOVER[word], wordRange);
    }
    // それ以外のブロックではフォールスルーしてユーザーシンボルを検索
  }

  // ── @event ハンドラの動的説明 ──
  // @click|prevent のような修飾子付きイベントに対応
  if (word.startsWith('@')) {
    const parts = word.slice(1).split('|');
    const evName = parts[0];
    const mods = parts.slice(1);
    // Event type mapping for DOM events
    const eventTypeMap = {
      'click': 'MouseEvent', 'dblclick': 'MouseEvent', 'mousedown': 'MouseEvent',
      'mouseup': 'MouseEvent', 'mousemove': 'MouseEvent', 'mouseenter': 'MouseEvent',
      'mouseleave': 'MouseEvent', 'mouseover': 'MouseEvent', 'mouseout': 'MouseEvent',
      'contextmenu': 'MouseEvent',
      'keydown': 'KeyboardEvent', 'keyup': 'KeyboardEvent', 'keypress': 'KeyboardEvent',
      'input': 'InputEvent', 'change': 'Event', 'focus': 'FocusEvent', 'blur': 'FocusEvent',
      'focusin': 'FocusEvent', 'focusout': 'FocusEvent',
      'submit': 'SubmitEvent', 'reset': 'Event',
      'scroll': 'Event', 'resize': 'UIEvent',
      'touchstart': 'TouchEvent', 'touchend': 'TouchEvent', 'touchmove': 'TouchEvent',
      'touchcancel': 'TouchEvent',
      'drag': 'DragEvent', 'dragstart': 'DragEvent', 'dragend': 'DragEvent',
      'dragenter': 'DragEvent', 'dragleave': 'DragEvent', 'dragover': 'DragEvent', 'drop': 'DragEvent',
      'pointerdown': 'PointerEvent', 'pointerup': 'PointerEvent', 'pointermove': 'PointerEvent',
      'wheel': 'WheelEvent',
      'animationstart': 'AnimationEvent', 'animationend': 'AnimationEvent',
      'transitionend': 'TransitionEvent',
      'load': 'Event', 'error': 'ErrorEvent',
    };
    const evType = eventTypeMap[evName] || 'Event';
    let md = `**@${evName}** — イベントリスナー\n\n`;
    md += `\`${evName}\` イベント発火時にハンドラを実行します。\n\n`;
    md += `**イベント型**: \`${evType}\`\n\n`;
    md += '```chasket\n';
    md += '// fn で定義した関数名を渡す（e は自動的に渡されます）\n';
    md += `<button @${word.slice(1)}="handleClick">...</button>\n\n`;
    md += '// 式も記述可能\n';
    md += `<button @${word.slice(1)}="count += 1">...</button>\n\n`;
    md += '// e (イベントオブジェクト) を関数に渡す\n';
    md += `<input @${word.slice(1)}="handleInput(e)">...</input>\n`;
    md += '```\n\n';
    md += `ハンドラ内では \`e\` で \`${evType}\` オブジェクトにアクセスできます。\n\n`;
    md += '**渡せる値**:\n';
    md += '- `fn` 定義の関数名（`e` が自動的に第1引数として渡される）\n';
    md += '- `state` 変数（関数を保持している場合、`e` を引数に呼ばれる）\n';
    md += '- 任意の式（`count += 1`、`doSomething(e)` など）\n\n';
    if (mods.length) {
      const modDoc = {
        'prevent': '`e.preventDefault()` — デフォルト動作を防止',
        'stop': '`e.stopPropagation()` — バブリングを停止',
        'once': '一度だけ実行し自動削除',
        'self': 'ターゲットが自分自身の場合のみ',
        'capture': 'キャプチャフェーズで実行',
        'enter': 'Enterキーのみ反応',
        'esc': 'Escapeキーのみ反応',
      };
      md += '**修飾子**:\n';
      mods.forEach(m => { md += `- \`|${m}\` — ${modDoc[m] || '不明な修飾子'}\n`; });
    }
    return mkHover(md, wordRange);
  }

  // ── :directive （:bind, :class, :style 等の動的バインディング） ──
  if (word.startsWith(':') && word.length > 1) {
    const attr = word.slice(1);
    const bindDocs = {
      'bind': '双方向データバインディング。フォーム要素の値とstateを同期。',
      'class': '動的クラス。オブジェクト `{ active: bool }` または配列 `[cls1, cls2]`。',
      'style': '動的スタイル。オブジェクト `{ color: val, fontSize: val }`。',
      'disabled': '動的disabled。`true` で disabled属性を付与、`false` で削除。',
      'checked': '動的checked。チェックボックスの状態を制御。',
      'hidden': '動的hidden。`true` で非表示。',
      'src': '動的src。画像やスクリプトのURLを動的に設定。',
      'href': '動的href。リンク先を動的に設定。',
      'alt': '動的alt。代替テキストを動的に設定。',
      'value': '動的value。一方向の値バインド（:bindとは異なり入力を監視しない）。',
      'placeholder': '動的placeholder。',
    };
    const desc = bindDocs[attr] || `動的属性バインディング。式の結果が \`${attr}\` 属性の値になります。`;
    return mkHover(`**:${attr}** — ${desc}\n\n\`\`\`chasket\n<div :${attr}="expression">\n\`\`\``, wordRange);
  }

  // ── キーワード特別処理 ──
  // fn, async, type は複合キーワードのためここで個別処理
  if (word === 'fn') return mkHover(HOVER['fn'], wordRange);
  if (word === 'async') return mkHover(HOVER['async'], wordRange);
  if (word === 'type') return mkHover(HOVER['type'], wordRange);

  // ── ユーザー定義シンボルの検索 ──
  // documentSymbols から識別子を検索し、型情報とJSDocを表示
  const uri = document.uri.toString();
  const syms = documentSymbols.get(uri);
  if (syms && syms.has(word)) {
    const sym = syms.get(word);
    let md = '';
    const sourceLabel = { state: 'state', prop: 'prop', computed: 'computed', fn: 'fn', emit: 'emit', ref: 'ref', provide: 'provide', consume: 'consume', 'const': 'const', 'let': 'let' };
    const kind = sourceLabel[sym.source] || sym.source;

    // ── シグネチャ行の構築 ──
    // 宣言タイプに応じた構文ハイライトを表示
    if (sym.source === 'fn') {
      // 関数: fn [async] name(params)
      const asyncMark = sym.async ? 'async ' : '';
      md += `\`\`\`chasket\nfn ${asyncMark}${word}(${sym.params || ''})\n\`\`\`\n\n`;
      md += `コンパイル: \`#${word}()\` private メソッド\n\n`;
    } else if (sym.source === 'emit') {
      // イベント: emit [(修飾子)] name: type
      const opts = sym.options ? `(${sym.options}) ` : '';
      md += `\`\`\`chasket\nemit${opts ? `(${sym.options})` : ''} ${word}: ${sym.type}\n\`\`\`\n\n`;
    } else if (sym.source === 'computed') {
      // 派生値: computed name: type = expr
      md += `\`\`\`chasket\ncomputed ${word}: ${sym.type} = ${sym.expr || '...'}\n\`\`\`\n\n`;
    } else if (sym.source === 'state') {
      // 状態変数: state name: type = init
      // 初期値が長い場合は省略表示
      const initDisplay = sym.init ? (sym.init.length > 50 ? sym.init.substring(0, 47) + '...' : sym.init) : '';
      const initStr = initDisplay ? ` = ${initDisplay}` : '';
      md += `\`\`\`chasket\nstate ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
      // 関数型の場合はイベントハンドラとして使える旨を表示
      if (sym.type.toLowerCase().includes('function') || (sym.init && (sym.init.includes('=>') || sym.init.includes('function')))) {
        md += `*関数式* — \`@click="${word}"\` でイベントハンドラとして使用可能\n\n`;
      }
    } else if (sym.source === 'prop') {
      const initStr = sym.init ? ` = ${sym.init}` : '';
      md += `\`\`\`chasket\nprop ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
      // コールバック prop の場合
      if (sym.type.toLowerCase().includes('function') || sym.type.includes('=>')) {
        md += `*コールバック* — 親から渡された関数。\`@click="${word}"\` で使用可能\n\n`;
      }
    } else if (sym.source === 'const' || sym.source === 'let') {
      const initDisplay = sym.init ? (sym.init.length > 50 ? sym.init.substring(0, 47) + '...' : sym.init) : '';
      const initStr = initDisplay ? ` = ${initDisplay}` : '';
      md += `\`\`\`chasket\n${kind} ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
      md += `*非リアクティブ* — 値の変更はDOMに反映されません。\n\n`;
      if (sym.init && (sym.init.includes('=>') || sym.init.includes('function'))) {
        md += `*関数式* — \`@click="${word}"\` でイベントハンドラとして使用可能\n\n`;
      }
    } else {
      // ref, provide, consume 等
      const initStr = sym.init ? ` = ${sym.init}` : '';
      md += `\`\`\`chasket\n${kind} ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
    }

    // ── JSDocコメント表示 ──
    // 宣言の直前にある /** ... */ コメントを表示
    // NEW-V10: ユーザー定義JSDocのマークダウン特殊文字をサニタイズ
    if (sym.doc) {
      const safeDoc = sym.doc.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
      md += `${safeDoc}\n\n`;
    }

    // ── メタ情報バッジ ──
    // 宣言の種類と行番号を表示
    md += `*${kind}* — line ${sym.line}`;

    return mkHover(md, wordRange);
  }

  return null;
}

/**
 * ホバーオブジェクト生成ヘルパー
 *
 * マークダウン文字列をVS Code形式のHoverオブジェクトに変換します。
 * isTrusted=trueにより、マークダウン内のHTMLタグが評価されます（セキュリティ確認済み）。
 *
 * @param {string} md - マークダウン形式のドキュメント文字列
 * @param {vscode.Range} range - ホバー対象の単語の範囲
 * @returns {vscode.Hover} VS Codeホバーオブジェクト
 */
function mkHover(md, range) {
  const h = new vscode.MarkdownString(md);
  // isTrusted=true でマークダウン内のHTML（リンク等）を有効化
  h.isTrusted = true;
  return new vscode.Hover(h, range);
}

/**
 * 自動補完プロバイダー（P2-44）
 *
 * Chasketキーワードとテンプレート構文の補完候補を提供します。
 * ユーザーが入力開始時に呼び出され、スニペット付きで候補を表示します。
 */

// ═══════════════════════════════════════════
// 自動補完候補辞書
// ═══════════════════════════════════════════
/**
 * 補完候補の辞書
 *
 * 各キーワードの補完設定: { kind, detail, insertText }
 * - kind: VS Code CompletionItemKind（キーワード、メソッド等）
 * - detail: 右側パネルに表示される説明
 * - insertText: スニペット形式のテンプレート（${1:name} はタブストップ）
 * @type {Object<string, {kind: vscode.CompletionItemKind, detail: string, insertText?: string}>}
 */
const COMPLETIONS = {
  // Script keywords
  'state': { kind: vscode.CompletionItemKind.Keyword, detail: 'リアクティブ変数', insertText: 'state ${1:name}: ${2:type} = ${3:value}' },
  'const': { kind: vscode.CompletionItemKind.Keyword, detail: '非リアクティブ定数', insertText: 'const ${1:NAME} = ${2:value}' },
  'let': { kind: vscode.CompletionItemKind.Keyword, detail: '非リアクティブ変数', insertText: 'let ${1:name} = ${2:value}' },
  'prop': { kind: vscode.CompletionItemKind.Keyword, detail: '外部属性', insertText: 'prop ${1:name}: ${2:type}' },
  'computed': { kind: vscode.CompletionItemKind.Keyword, detail: '派生値', insertText: 'computed ${1:name}: ${2:type} = ${3:expr}' },
  'emit': { kind: vscode.CompletionItemKind.Keyword, detail: 'カスタムイベント', insertText: 'emit ${1:name}: ${2:type}' },
  'ref': { kind: vscode.CompletionItemKind.Keyword, detail: 'DOM参照', insertText: 'ref ${1:name}: ${2:type}' },
  'fn': { kind: vscode.CompletionItemKind.Keyword, detail: '関数定義', insertText: 'fn ${1:name}(${2:params}) {\n  ${3:}\n}' },
  'on mount': { kind: vscode.CompletionItemKind.Keyword, detail: 'マウント時の処理', insertText: 'on mount {\n  ${1:}\n}' },
  'on unmount': { kind: vscode.CompletionItemKind.Keyword, detail: 'アンマウント時の処理', insertText: 'on unmount {\n  ${1:}\n}' },
  'on adopt': { kind: vscode.CompletionItemKind.Keyword, detail: 'スロット採用時の処理', insertText: 'on adopt {\n  ${1:}\n}' },
  'on formReset': { kind: vscode.CompletionItemKind.Keyword, detail: 'フォームリセット時', insertText: 'on formReset {\n  ${1:}\n}' },
  'on formAssociated': { kind: vscode.CompletionItemKind.Keyword, detail: 'フォーム関連付け時', insertText: 'on formAssociated {\n  ${1:}\n}' },
  'on formDisabled': { kind: vscode.CompletionItemKind.Keyword, detail: 'フォーム無効化時', insertText: 'on formDisabled {\n  ${1:}\n}' },
  'on formStateRestore': { kind: vscode.CompletionItemKind.Keyword, detail: 'フォーム復元時', insertText: 'on formStateRestore {\n  ${1:}\n}' },
  'setFormValue': { kind: vscode.CompletionItemKind.Function, detail: 'フォーム値設定', insertText: 'setFormValue(${1:value})' },
  'setValidity': { kind: vscode.CompletionItemKind.Function, detail: 'バリデーション設定', insertText: 'setValidity(${1:flags}, ${2:message})' },
  'watch': { kind: vscode.CompletionItemKind.Keyword, detail: '副作用', insertText: 'watch(${1:dependency}) {\n  ${2:}\n}' },
  'provide': { kind: vscode.CompletionItemKind.Keyword, detail: 'コンテキスト提供', insertText: 'provide ${1:name}: ${2:type} = ${3:value}' },
  'consume': { kind: vscode.CompletionItemKind.Keyword, detail: 'コンテキスト受信', insertText: 'consume ${1:name}: ${2:type}' },
  'import': { kind: vscode.CompletionItemKind.Keyword, detail: 'インポート', insertText: 'import ${1:name} from "${2:path}"' },
  'type': { kind: vscode.CompletionItemKind.Keyword, detail: '型エイリアス', insertText: 'type ${1:Name} = ${2:type}' },
  'generic': { kind: vscode.CompletionItemKind.Keyword, detail: 'ジェネリック型パラメータ（meta内）', insertText: 'generic: ${1:T}' },

  // Template directives
  '#if': { kind: vscode.CompletionItemKind.Keyword, detail: '条件分岐', insertText: '<#if cond="${1:condition}">\n  ${2:}\n</#if>' },
  '#for': { kind: vscode.CompletionItemKind.Keyword, detail: 'ループ', insertText: '<#for each="${1:item}" of="${2:items}" key="${3:item.id}">\n  ${4:}\n</#for>' },
  ':else': { kind: vscode.CompletionItemKind.Keyword, detail: 'else分岐', insertText: '<:else>' },
  ':else-if': { kind: vscode.CompletionItemKind.Keyword, detail: 'else-if分岐', insertText: '<:else-if cond="${1:condition}">' },
  ':empty': { kind: vscode.CompletionItemKind.Keyword, detail: '空時の表示', insertText: '<:empty>\n  ${1:}\n</:empty>' },
  '{{ }}': { kind: vscode.CompletionItemKind.Snippet, detail: 'テンプレート式', insertText: '{{ ${1:expr} }}' },
  '@html': { kind: vscode.CompletionItemKind.Keyword, detail: '生HTML注入（XSS注意）', insertText: '@html="${1:content}"' },

  // File scaffold snippet (like HTML's ! shortcut)
  'chasket': { kind: vscode.CompletionItemKind.Snippet, detail: 'Chasket コンポーネント雛形', insertText: '<meta>\n  name: "${1:x-my-component}"\n  shadow: ${2|open,closed,none|}\n</meta>\n\n<script>\n  ${3:state count: number = 0}\n</script>\n\n<template>\n  ${4:<p>Hello, Chasket!</p>}\n</template>\n\n<style>\n  ${5::host \\{ display: block; \\}}\n</style>' },
  'chasket-minimal': { kind: vscode.CompletionItemKind.Snippet, detail: '最小 Chasket コンポーネント', insertText: '<meta>\n  name: "${1:x-my-component}"\n</meta>\n\n<template>\n  ${2:<p>Hello!</p>}\n</template>' },

  // Event handlers
  '@click': { kind: vscode.CompletionItemKind.Method, detail: 'クリックイベント', insertText: '@click="${1:handler}"' },
  '@input': { kind: vscode.CompletionItemKind.Method, detail: 'input イベント', insertText: '@input="${1:handler}"' },
  '@change': { kind: vscode.CompletionItemKind.Method, detail: 'change イベント', insertText: '@change="${1:handler}"' },
  '@submit': { kind: vscode.CompletionItemKind.Method, detail: 'submit イベント', insertText: '@submit|prevent="${1:handler}"' },
  '@keydown': { kind: vscode.CompletionItemKind.Method, detail: 'keydown イベント', insertText: '@keydown="${1:handler}"' },
  '@keyup': { kind: vscode.CompletionItemKind.Method, detail: 'keyup イベント', insertText: '@keyup="${1:handler}"' },
  '@focus': { kind: vscode.CompletionItemKind.Method, detail: 'focus イベント', insertText: '@focus="${1:handler}"' },
  '@blur': { kind: vscode.CompletionItemKind.Method, detail: 'blur イベント', insertText: '@blur="${1:handler}"' },
  '@mouseenter': { kind: vscode.CompletionItemKind.Method, detail: 'mouseenter イベント', insertText: '@mouseenter="${1:handler}"' },
  '@mouseleave': { kind: vscode.CompletionItemKind.Method, detail: 'mouseleave イベント', insertText: '@mouseleave="${1:handler}"' },
  '@dblclick': { kind: vscode.CompletionItemKind.Method, detail: 'ダブルクリック', insertText: '@dblclick="${1:handler}"' },

  // Dynamic attribute bindings
  ':class': { kind: vscode.CompletionItemKind.Property, detail: '動的クラス', insertText: ':class="${1:expression}"' },
  ':style': { kind: vscode.CompletionItemKind.Property, detail: '動的スタイル', insertText: ':style="${1:expression}"' },
  ':id': { kind: vscode.CompletionItemKind.Property, detail: '動的ID', insertText: ':id="${1:expression}"' },
  ':src': { kind: vscode.CompletionItemKind.Property, detail: '動的src（URL安全チェック付）', insertText: ':src="${1:imageUrl}"' },
  ':href': { kind: vscode.CompletionItemKind.Property, detail: '動的href（URL安全チェック付）', insertText: ':href="${1:url}"' },
  ':alt': { kind: vscode.CompletionItemKind.Property, detail: '動的alt', insertText: ':alt="${1:altText}"' },
  ':value': { kind: vscode.CompletionItemKind.Property, detail: '動的value', insertText: ':value="${1:expression}"' },
  ':placeholder': { kind: vscode.CompletionItemKind.Property, detail: '動的placeholder', insertText: ':placeholder="${1:text}"' },
  ':disabled': { kind: vscode.CompletionItemKind.Property, detail: '動的disabled', insertText: ':disabled="${1:isDisabled}"' },
  ':hidden': { kind: vscode.CompletionItemKind.Property, detail: '動的hidden', insertText: ':hidden="${1:isHidden}"' },
  ':checked': { kind: vscode.CompletionItemKind.Property, detail: '動的checked', insertText: ':checked="${1:isChecked}"' },
  ':for': { kind: vscode.CompletionItemKind.Property, detail: '動的for（label用）', insertText: ':for="${1:inputId}"' },
  ':title': { kind: vscode.CompletionItemKind.Property, detail: '動的title', insertText: ':title="${1:tooltip}"' },
  ':name': { kind: vscode.CompletionItemKind.Property, detail: '動的name', insertText: ':name="${1:fieldName}"' },
  ':type': { kind: vscode.CompletionItemKind.Property, detail: '動的type', insertText: ':type="${1:inputType}"' },
  ':maxlength': { kind: vscode.CompletionItemKind.Property, detail: '動的maxlength', insertText: ':maxlength="${1:max}"' },
  ':pattern': { kind: vscode.CompletionItemKind.Property, detail: '動的pattern', insertText: ':pattern="${1:regex}"' },
  ':required': { kind: vscode.CompletionItemKind.Property, detail: '動的required', insertText: ':required="${1:isRequired}"' },
  ':readonly': { kind: vscode.CompletionItemKind.Property, detail: '動的readonly', insertText: ':readonly="${1:isReadOnly}"' },
  ':aria-label': { kind: vscode.CompletionItemKind.Property, detail: '動的aria-label', insertText: ':aria-label="${1:label}"' },
  ':data-': { kind: vscode.CompletionItemKind.Property, detail: '動的data属性', insertText: ':data-${1:name}="${2:value}"' },

  // Two-way binding
  ':bind': { kind: vscode.CompletionItemKind.Method, detail: '双方向バインディング', insertText: ':bind="${1:stateName}"' },

  // Ref
  'ref': { kind: vscode.CompletionItemKind.Method, detail: 'DOM参照', insertText: 'ref="${1:refName}"' },

  // Slot
  'slot': { kind: vscode.CompletionItemKind.Keyword, detail: 'スロット定義', insertText: '<slot${1: name="${2:slotName}"}>${3}</slot>' },
};

/**
 * 自動補完提供プロバイダー
 *
 * カーソル位置でのキーワードマッチに基づいて補完候補を返します。
 * 現在の実装はすべての候補を常に返し、VS Code側でフィルタリングさせます。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {vscode.Position} position - 補完位置
 * @returns {vscode.CompletionItem[]} 補完候補の配列
 */
function provideCompletionItems(document, position) {
  const line = document.lineAt(position).text;
  const beforeCursor = line.substring(0, position.character);
  const items = [];

  // ── 単語の開始地点であることを確認 ──
  // /[\w-]*$/ は行末までの単語を抽出（キーワード候補を絞り込む）
  const wordMatch = beforeCursor.match(/[\w-]*$/);
  if (wordMatch) {
    // ── 補完候補の構築 ──
    // COMPLETIONS辞書のすべてのキーワードについて補完アイテムを作成
    for (const [key, config] of Object.entries(COMPLETIONS)) {
      const item = new vscode.CompletionItem(key, config.kind);
      item.detail = config.detail; // 右側パネルに表示
      if (config.insertText) item.insertText = new vscode.SnippetString(config.insertText); // スニペット
      item.documentation = new vscode.MarkdownString(`**${key}** — ${config.detail}`); // ホバー説明
      items.push(item);
    }
  }

  return items;
}

/**
 * 定義へのジャンププロバイダー（P2-45）
 *
 * 識別子をCtrl+クリック（またはF12）で宣言位置にジャンプできます。
 * シンボル表から該当識別子を検索し、その行番号を返します。
 */

/**
 * 定義位置の取得プロバイダー
 *
 * カーソル位置の識別子が<script>内で宣言されている場合、その行番号を返します。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {vscode.Position} position - カーソル位置
 * @returns {vscode.Location|null} 定義位置、見つからなければnull
 */
function provideDefinition(document, position) {
  const line = document.lineAt(position).text;
  const col = position.character;
  const uri = document.uri.toString();
  const syms = documentSymbols.get(uri);

  if (!syms) return null;

  // ── 単語範囲の取得 ──
  const wordRange = document.getWordRangeAtPosition(position);
  if (!wordRange) return null;

  const word = document.getText(wordRange);

  // ────────────────────────────────────────
  // テンプレート内のコンテキストを検出して処理
  // ────────────────────────────────────────

  // 1. {{ 式 }} 内の変数参照の検出
  // 例: {{ count }}  →  state count
  const interpMatch = line.match(/\{\{\s*(.+?)\s*\}\}/g);
  if (interpMatch) {
    for (const match of interpMatch) {
      const startIdx = line.indexOf(match);
      const endIdx = startIdx + match.length;
      if (col >= startIdx && col < endIdx) {
        // カーソルが {{ }} 内にある
        const expr = match.replace(/\{\{\s*|\s*\}\}/g, '').trim();

        // 式から最初の識別子を抽出（例: "count" or "user.name" → "count" / "user"）
        const idMatch = expr.match(/^(\w+)/);
        if (idMatch) {
          const id = idMatch[1];
          if (syms.has(id)) {
            const sym = syms.get(id);
            return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
          }
        }
        return null;
      }
    }
  }

  // 2. イベントハンドラ内の関数参照の検出
  // 例: @click="increment"  →  fn increment()
  //     @input="updateName"  →  fn updateName()
  const eventMatch = line.match(/@(\w+(?:\|\w+)*)="([^"]*)"/g);
  if (eventMatch) {
    for (const match of eventMatch) {
      const startIdx = line.indexOf(match);
      const endIdx = startIdx + match.length;
      if (col >= startIdx && col < endIdx) {
        // カーソルが @event="..." 内にある
        const handlerMatch = match.match(/@\w+(?:\|\w+)*="([^"]*)"/);
        if (handlerMatch) {
          const handler = handlerMatch[1].trim();
          // 関数名を抽出（"count()" や "count" の形式）
          const fnMatch = handler.match(/^(\w+)(?:\s*\()?/);
          if (fnMatch) {
            const fnName = fnMatch[1];
            if (syms.has(fnName)) {
              const sym = syms.get(fnName);
              return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
            }
          }
        }
        return null;
      }
    }
  }

  // 3. :bind ディレクティブ内の変数参照の検出
  // 例: :bind="userName"  →  state userName
  const bindMatch = line.match(/:bind="([^"]*)"/g);
  if (bindMatch) {
    for (const match of bindMatch) {
      const startIdx = line.indexOf(match);
      const endIdx = startIdx + match.length;
      if (col >= startIdx && col < endIdx) {
        // カーソルが :bind="..." 内にある
        const varMatch = match.match(/:bind="([^"]*)"/);
        if (varMatch) {
          const varName = varMatch[1].trim();
          // 最初の識別子を抽出
          const idMatch = varName.match(/^(\w+)/);
          if (idMatch) {
            const id = idMatch[1];
            if (syms.has(id)) {
              const sym = syms.get(id);
              return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
            }
          }
        }
        return null;
      }
    }
  }

  // 4. 動的属性値（:value, :class, :style 等）の検出
  // 例: :value="count"  →  state count
  //     :class="activeClass"  →  state/computed activeClass
  const dynamicAttrMatch = line.match(/:([\w-]+)="([^"]*)"/g);
  if (dynamicAttrMatch) {
    for (const match of dynamicAttrMatch) {
      const startIdx = line.indexOf(match);
      const endIdx = startIdx + match.length;
      if (col >= startIdx && col < endIdx) {
        // カーソルが :attr="..." 内にある
        const valueMatch = match.match(/:[^=]+="\s*([^"]*?)\s*"/);
        if (valueMatch) {
          const value = valueMatch[1];
          // 最初の識別子を抽出
          const idMatch = value.match(/^(\w+)/);
          if (idMatch) {
            const id = idMatch[1];
            if (syms.has(id)) {
              const sym = syms.get(id);
              return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
            }
          }
        }
        return null;
      }
    }
  }

  // ────────────────────────────────────────
  // テンプレート外のコンテキスト
  // （スクリプト内またはその他の場所）
  // ────────────────────────────────────────

  // 5. 単純なシンボルテーブル検索
  // （テンプレート特有の構文でない場合）
  if (syms.has(word)) {
    const sym = syms.get(word);
    return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
  }

  return null;
}

/**
 * ドキュメント シンボルプロバイダー（P2-50）
 *
 * 右側パネルの「アウトライン」に表示されるコンポーネント構造を提供します。
 * state, prop, fn, emit, ref などのすべての宣言をツリー形式で表示します。
 */

/**
 * ドキュメントシンボルの取得プロバイダー
 *
 * ドキュメント内の すべてのシンボル（宣言）をVS Code形式に変換して返します。
 * VS Codeは自動的に右側パネルにツリー表示します。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @returns {vscode.DocumentSymbol[]} シンボルの配列
 */
function provideDocumentSymbols(document) {
  const uri = document.uri.toString();
  const syms = documentSymbols.get(uri);
  if (!syms) return [];

  const symbols = [];
  // ── シンボル種別からVS Code SymbolKindへの変換 ──
  // 右側パネルに表示されるアイコンと分類を決定
  const kindMap = {
    state: vscode.SymbolKind.Variable,      // 変数アイコン
    prop: vscode.SymbolKind.Property,       // プロパティアイコン
    computed: vscode.SymbolKind.Property,   // プロパティアイコン
    fn: vscode.SymbolKind.Function,         // 関数アイコン
    emit: vscode.SymbolKind.Event,          // イベントアイコン
    ref: vscode.SymbolKind.Field,           // フィールドアイコン
    provide: vscode.SymbolKind.Property,    // プロパティアイコン
    consume: vscode.SymbolKind.Property,    // プロパティアイコン
    watch: vscode.SymbolKind.Function,      // 関数アイコン
  };

  // ── シンボルテーブルをVS Code形式に変換 ──
  for (const [name, sym] of syms) {
    const kind = kindMap[sym.source] || vscode.SymbolKind.Variable;
    const docSym = new vscode.DocumentSymbol(
      name,                                          // シンボル名
      sym.source,                                    // 説明（state, fn等）
      kind,                                          // アイコン種別
      new vscode.Range(sym.line, 0, sym.line, 1),  // シンボルの範囲
      new vscode.Range(sym.line, 0, sym.line, 1)   // 選択時のジャンプ範囲
    );
    symbols.push(docSym);
  }

  return symbols;
}

/**
 * 診断エンジン（メイン検証ロジック）
 *
 * Chasketドキュメントの構文と意味論を検証し、エラー・警告・ヒントを生成します。
 * 実行パイプライン:
 * 1. インクリメンタル解析（P2-54）: ハッシュ比較で不変ドキュメントはスキップ
 * 2. ブロック解析: <meta>, <script>, <template>, <style> を抽出
 * 3. シンボルテーブル構築: state, prop, fn, emit等の宣言を収集
 * 4. テンプレート検証: 変数参照、イベントハンドラ、ブロック構文をチェック
 * 5. セキュリティ警告: @html, 動的URL等をフラグ
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @returns {void}
 */
function runDiagnostics(document) {
  // ── 診断の有効性確認 ──
  const config = vscode.workspace.getConfiguration('chasket');
  if (!config.get('enableDiagnostics', true)) return;

  const source = document.getText();
  const diagnostics = [];

  // ── インクリメンタル解析（P2-54） ──
  // コンテンツハッシュが同じ場合は再解析をスキップ（パフォーマンス最適化）
  const uri = document.uri.toString();
  const currentHash = hashContent(source);
  if (documentHashes.get(uri) === currentHash) return;
  documentHashes.set(uri, currentHash);

  // ── ブロック解析 ──
  // <meta>, <script>, <template>, <style> タグを抽出
  const blocks = [];
  const blockRe = /<(meta|script|template|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let bm;
  while ((bm = blockRe.exec(source)) !== null) {
    blocks.push({
      type: bm[1],                                           // ブロック種別
      content: bm[3],                                         // タグ内容
      startLine: source.substring(0, bm.index).split('\n').length - 1 // ドキュメント内の行番号
    });
  }

  // ── テンプレート必須チェック ──
  // Chasketコンポーネントは <template> ブロックが必須
  if (!blocks.some(b => b.type === 'template')) {
    diagnostics.push(mkDiag(0, 0, 0, 1, '<template> ブロックが見つかりません', 'error'));
    diagnosticCollection.set(document.uri, diagnostics);
    return;
  }

  // ── シンボルテーブル構築 ──
  // <script> ブロック内の宣言（state, fn, emit等）を収集して documentSymbols に登録
  const symbols = new Map();
  const scriptBlock = blocks.find(b => b.type === 'script');
  if (scriptBlock) {
    const lines = scriptBlock.content.split('\n');

    /**
     * JSDocコメント抽出ヘルパー
     *
     * 指定行の直前にある JSDoc コメントを抽出します。
     * 単一行と複数行の両形式に対応。
     *
     * @param {number} lineIndex - コメント対象の行インデックス（lines配列内）
     * @returns {string} 抽出されたJSDocテキスト（複数行の場合は\nで結合）
     */
    function getJsDoc(lineIndex) {
      let doc = '';
      let j = lineIndex - 1;
      // ── 単一行JSDoc: /** comment */ ──
      if (j >= 0 && lines[j].trim().match(/^\/\*\*(.+)\*\/$/)) {
        return lines[j].trim().replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '').trim();
      }
      // ── 複数行JSDoc: /** ... \n * ... \n */ ──
      // 後ろから遡ってJSDocのすべての行を収集
      const collected = [];
      while (j >= 0 && !lines[j].trim().startsWith('/**')) {
        const l = lines[j].trim();
        if (l === '*/') { j--; continue; }
        if (l.startsWith('*')) { collected.unshift(l.replace(/^\*\s?/, '')); j--; continue; }
        break;
      }
      if (j >= 0 && lines[j].trim().startsWith('/**')) {
        const first = lines[j].trim().replace(/^\/\*\*\s?/, '').replace(/\s*\*?\s*$/, '').trim();
        if (first) collected.unshift(first);
        return collected.join('\n').trim();
      }
      return '';
    }

    // ── スクリプトブロック内の宣言をスキャン ──
    // 各行をシンボルテーブルに登録
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const docLine = scriptBlock.startLine + i + 1; // ドキュメント全体での行番号
      const jsDoc = getJsDoc(i); // 直前のJSDocコメント抽出
      let m;

      // ── state 宣言 ──
      // state name: type = initialValue
      if ((m = line.match(/^state\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/))) {
        symbols.set(m[1], { type: m[2].trim(), source: 'state', line: docLine, init: m[3].trim(), doc: jsDoc });
      } else if ((m = line.match(/^state\s+(\w+)/)) && !line.includes('=')) {
        // state は初期値が必須
        diagnostics.push(mkDiag(docLine, 0, docLine, line.length, `state '${m[1]}' には初期値（= value）が必要です`, 'error'));
      }

      // ── prop 宣言 ──
      // prop name: type [= defaultValue]
      if ((m = line.match(/^prop\s+(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/)))
        symbols.set(m[1], { type: m[2].trim(), source: 'prop', line: docLine, init: m[3]?.trim(), doc: jsDoc });

      // ── computed 宣言 ──
      // computed name: type = expression
      if ((m = line.match(/^computed\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/)))
        symbols.set(m[1], { type: m[2].trim(), source: 'computed', line: docLine, expr: m[3].trim(), doc: jsDoc });

      // ── fn 宣言 ──
      // P2-53: 複数行関数定義に対応
      // fn [async] name( ... )
      if ((m = line.match(/^fn\s+(async\s+)?(\w+)\s*\(/))) {
        // 開き括弧以降のテキスト（同じ行の残り）を取得
        let params = line.substring(m[0].length);
        let j = i;
        while (!params.includes(')') && j < lines.length - 1) {
          j++;
          params += ' ' + lines[j];
        }
        const closeParen = params.indexOf(')');
        if (closeParen !== -1) {
          const paramsOnly = params.substring(0, closeParen).trim();
          symbols.set(m[2], { type: 'function', source: 'fn', line: docLine, async: !!m[1], params: paramsOnly, doc: jsDoc });
        }
      }

      // ── emit 宣言 ──
      // emit [(修飾子)] name: type
      if ((m = line.match(/^emit(?:\(([^)]*)\))?\s+(\w+)\s*:\s*(.+)$/)))
        symbols.set(m[2], { type: m[3].trim(), source: 'emit', line: docLine, options: m[1]?.trim(), doc: jsDoc });

      // ── ref 宣言 ──
      // ref name: type
      if ((m = line.match(/^ref\s+(\w+)\s*:\s*(.+)$/)))
        symbols.set(m[1], { type: m[2].trim(), source: 'ref', line: docLine, doc: jsDoc });

      // ── provide 宣言 ──
      // provide name: type = value
      if ((m = line.match(/^provide\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$/)))
        symbols.set(m[1], { type: m[2].trim(), source: 'provide', line: docLine, init: m[3].trim(), doc: jsDoc });

      // ── consume 宣言 ──
      // consume name: type
      if ((m = line.match(/^consume\s+(\w+)\s*:\s*(.+)$/)))
        symbols.set(m[1], { type: m[2].trim(), source: 'consume', line: docLine, doc: jsDoc });

      // ── const 宣言 ──
      // const name: type = value  または  const name = value
      if ((m = line.match(/^const\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(.+)$/)))
        symbols.set(m[1], { type: m[2]?.trim() || 'any', source: 'const', line: docLine, init: m[3].trim(), doc: jsDoc });

      // ── let 宣言 ──
      // let name: type = value  または  let name = value
      if ((m = line.match(/^let\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(.+)$/)))
        symbols.set(m[1], { type: m[2]?.trim() || 'any', source: 'let', line: docLine, init: m[3].trim(), doc: jsDoc });

      // ── watch 依存チェック ──
      // watch(...) { ... } の括弧内で参照される値が宣言されているか確認
      if ((m = line.match(/^watch\s*\(([^)]+)\)\s*\{/))) {
        const deps = m[1].split(',').map(d => d.trim());
        for (const dep of deps) {
          if (!symbols.has(dep)) {
            diagnostics.push(mkDiag(docLine, 0, docLine, line.length,
              `watch の依存 '${dep}' が state として宣言されていません`, 'warning'));
          }
        }
      }
    }
  }

  // ── テンプレートブロックの検証 ──
  // 変数参照、イベントハンドラ、ブロック構文をチェック
  const templateBlock = blocks.find(b => b.type === 'template');
  if (templateBlock) {
    const tplContent = templateBlock.content;
    const tplLines = tplContent.split('\n');

    // ── ループ変数スコープの収集 ──
    // #for ループの範囲内でのみ、ループ変数（each, index）が有効
    // { each: string, index?: string, fromLine: number, toLine: number }
    const loopScopes = [];
    const forOpenRe = /<#for\s+each="([^"]+)"/g;
    let fm;
    while ((fm = forOpenRe.exec(tplContent)) !== null) {
      const eachParts = fm[1].split(',').map(s => s.trim());
      const lineNum = tplContent.substring(0, fm.index).split('\n').length - 1;
      // マッチする </#for> を検索
      const closeIdx = findClose(tplContent, fm.index + fm[0].length, '#for');
      const closeLine = tplContent.substring(0, closeIdx).split('\n').length - 1;
      loopScopes.push({
        each: eachParts[0],      // ループ変数名
        index: eachParts[1] || null, // インデックス変数名（optional）
        fromLine: lineNum,        // ループ開始行
        toLine: closeLine,        // ループ終了行
      });
    }

    // ── 予約語セット ──
    // 未定義チェックの対象外とする言語キーワード、ビルトイン、一般的な略字
    const reserved = new Set([
      'true','false','null','undefined','void','typeof','instanceof',
      'new','return','if','else','for','while','const','let','var',
      'function','class','this','super','import','export','from',
      'await','async','try','catch','finally','throw',
      'length','map','filter','reduce','push','pop','trim',
      'includes','indexOf','slice','splice','concat','join','split',
      'toFixed','toString','toUpperCase','toLowerCase','replace','match',
      'startsWith','endsWith','parseInt','parseFloat',
      'String','Number','Boolean','Array','Object','Math','JSON',
      'console','window','document','fetch','Promise','Date','Error',
      'event','e','r','s','i','t','n','ok','data','error',
    ]);

    // ── テンプレート行ごとの検証 ──
    for (let i = 0; i < tplLines.length; i++) {
      const line = tplLines[i];
      const docLine = templateBlock.startLine + i + 1;

      // ── ローカルスコープの構築 ──
      // スクリプトシンボル + このライン内で有効なループ変数
      const localSymbols = new Map(symbols);
      for (const scope of loopScopes) {
        if (i >= scope.fromLine && i <= scope.toLine) {
          localSymbols.set(scope.each, { type: 'any', source: 'loop' });
          if (scope.index) localSymbols.set(scope.index, { type: 'number', source: 'loop' });
          // 一般的なエイリアス 'index' も追加
          localSymbols.set('index', { type: 'number', source: 'loop' });
        }
      }

      // ── {{ 式 }} の検証 ──
      // テンプレート式内の変数参照とメソッド呼び出しをチェック
      const interpRe = /\{\{\s*(.+?)\s*\}\}/g;
      let im;
      while ((im = interpRe.exec(line)) !== null) {
        const expr = im[1];

        // ── 型違反メソッド呼び出しの検出 ──
        // 例: numberType.toUpperCase() → エラー
        const methMatch = expr.match(/^(\w+)\.(\w+)\(/);
        if (methMatch) {
          const sym = localSymbols.get(methMatch[1]);
          if (sym) {
            const strMethods = ['toUpperCase','toLowerCase','trim','split','replace','includes','startsWith','endsWith'];
            if (sym.type === 'number' && strMethods.includes(methMatch[2])) {
              const col = im.index + 2;
              diagnostics.push(mkDiag(docLine, col, docLine, col + expr.length,
                `'${methMatch[1]}' は 'number' 型ですが、'${methMatch[2]}' メソッドはありません — String(${methMatch[1]}) を使用してください`, 'error'));
            }
          }
        }

        // ── 未定義変数の検出 ──
        // 文字列リテラル内の識別子は除外（false positive 防止）
        const stripped = expr.replace(/"(?:[^"\\]|\\.)*"/g, ' ').replace(/'(?:[^'\\]|\\.)*'/g, ' ').replace(/`(?:[^`\\]|\\.)*`/g, ' ');
        const ids = stripped.match(/\b[a-zA-Z_]\w*\b/g) || [];
        for (const id of ids) {
          if (reserved.has(id)) continue;          // 予約語は無視
          if (localSymbols.has(id)) continue;      // 定義済みなら OK
          // Levenshtein距離で近い識別子を提案（タイポの可能性）
          let suggestion = null;
          for (const [key] of localSymbols) { if (lev(id, key) <= 2) { suggestion = key; break; } }
          const col = line.indexOf(id, im.index);
          diagnostics.push(mkDiag(docLine, col >= 0 ? col : 0, docLine, (col >= 0 ? col : 0) + id.length,
            `未定義の識別子 '${id}'${suggestion ? ` — '${suggestion}' のことですか？` : ''}`, 'error'));
        }
      }

      // ── @event ハンドラの検証 ──
      // イベントハンドラが fn として定義されているか確認
      // NEW-V12: 修飾子数を最大10に制限（ReDoS防止）
      const eventRe = /@(\w+(?:\|\w+){0,10})="([^"]*)"/g;
      let em;
      while ((em = eventRe.exec(line)) !== null) {
        const handler = em[2].trim();
        // 関数名を抽出（"count = 0" や "fn(args)" のような式は無視）
        const fnName = handler.match(/^(\w+)$/)?.[1] || handler.match(/^(\w+)\s*\(/)?.[1];
        if (fnName && !symbols.has(fnName) && !handler.includes('=')) {
          // フォールバック: scriptの生テキスト内に fn 宣言が存在するか確認
          // （シンボルテーブル構築が何らかの理由で漏れた場合の安全策）
          const scriptText = scriptBlock ? scriptBlock.content : '';
          const fnDeclPattern = new RegExp(`\\bfn\\s+(?:async\\s+)?${fnName}\\s*\\(`);
          if (fnDeclPattern.test(scriptText)) continue; // scriptに定義あり → 警告しない
          const col = em.index + em[1].length + 2; // @event=" の後
          diagnostics.push(mkDiag(docLine, col, docLine, col + handler.length,
            `イベントハンドラ '${fnName}' が <script> 内に定義されていません — fn ${fnName}() { ... } を追加してください`, 'warning'));
        }
      }

      // ── @html セキュリティ警告 ──
      // @html はHTMLをエスケープしないため、XSS対策が必須
      const htmlRe = /@html="([^"]*)"/g;
      let hm;
      while ((hm = htmlRe.exec(line)) !== null) {
        const col = hm.index;
        diagnostics.push(mkDiag(docLine, col, docLine, col + hm[0].length,
          '@html はエスケープされません。XSS脆弱性のリスクがあります。信頼できるデータのみ使用してください', 'warning'));
      }

      // ── 動的URL（:href, :src等）のセキュリティ警告 ──
      // JavaScript: URLインジェクション対策の必要性を警告
      const dynUrlRe = /:(href|src|action|formaction)="([^"]*)"/g;
      let dum;
      while ((dum = dynUrlRe.exec(line)) !== null) {
        const col = dum.index;
        diagnostics.push(mkDiag(docLine, col, docLine, col + dum[0].length,
          `動的な :${dum[1]} は javascript: URL インジェクションに注意してください`, 'hint'));
      }

      // ── #for の必須属性チェック ──
      // each, of, key は必須
      if (line.match(/<#for\b/)) {
        if (!line.includes('each='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, '#for: 必須属性 each が不足 — each="変数名"', 'error'));
        if (!line.includes('of='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, '#for: 必須属性 of が不足 — of="配列名"', 'error'));
        if (!line.includes('key='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, '#for: 必須属性 key が不足 — key="一意キー"', 'error'));
      }

      // ── #if の必須属性チェック ──
      // condition は必須
      if (line.match(/<#if\b/) && !line.includes('condition='))
        diagnostics.push(mkDiag(docLine, 0, docLine, line.length, '#if: 必須属性 condition が不足 — condition="条件式"', 'error'));
    }

    // ── ブロックの未閉じチェック ──
    // #if ブロックの開閉タグ数を比較
    const openIf = (tplContent.match(/<#if/g) || []).length;
    const closeIf = (tplContent.match(/<\/#if>/g) || []).length;
    if (openIf > closeIf)
      diagnostics.push(mkDiag(templateBlock.startLine + 1, 0, templateBlock.startLine + 1, 1,
        `未閉じの #if ブロック（開: ${openIf}, 閉: ${closeIf}）`, 'error'));
    // #for ブロックの開閉タグ数を比較
    const openFor = (tplContent.match(/<#for/g) || []).length;
    const closeFor = (tplContent.match(/<\/#for>/g) || []).length;
    if (openFor > closeFor)
      diagnostics.push(mkDiag(templateBlock.startLine + 1, 0, templateBlock.startLine + 1, 1,
        `未閉じの #for ブロック（開: ${openFor}, 閉: ${closeFor}）`, 'error'));

    // ── 未使用 state の検出 ──
    // テンプレートと他の fn/watch内で使用されていない state を警告
    for (const [name, sym] of symbols) {
      if (sym.source !== 'state') continue;
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(tplContent)) continue; // テンプレートで使用されている
      // スクリプト内の使用確認
      let usedInScript = false;
      if (scriptBlock) {
        const sLines = scriptBlock.content.split('\n');
        const declIdx = sLines.findIndex(l => l.trim().startsWith(`state ${name}`));
        sLines.forEach((l, idx) => { if (idx !== declIdx && re.test(l)) usedInScript = true; });
      }
      if (!usedInScript)
        diagnostics.push(mkDiag(sym.line, 0, sym.line, 1, `state '${name}' が宣言されましたが使用されていません`, 'warning'));
    }
  }

  // ── メタブロックの検証 ──
  // カスタム要素名がハイフンを含むか確認
  const metaBlock = blocks.find(b => b.type === 'meta');
  if (metaBlock) {
    for (const [i, line] of metaBlock.content.split('\n').entries()) {
      const m = line.trim().match(/^\s*name\s*:\s*["']?([^"'\s]+)["']?\s*$/);
      if (m && !m[1].includes('-'))
        diagnostics.push(mkDiag(metaBlock.startLine + i + 1, 0, metaBlock.startLine + i + 1, line.length,
          `カスタム要素名 '${m[1]}' にはハイフンが必要です（例: x-${m[1]}）`, 'error'));
    }
  }

  // ── シンボルテーブルをキャッシュ ──
  // ホバー・定義ジャンプ・シンボルプロバイダーで使用
  documentSymbols.set(document.uri.toString(), symbols);

  // ── 診断を VS Code に送信 ──
  diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * ユーティリティ関数
 */

// ═══════════════════════════════════════════
// ハッシュ・キャッシング
// ═══════════════════════════════════════════

/**
 * コンテンツハッシュ関数（djb2アルゴリズム）
 *
 * P2-54: インクリメンタル解析用のコンテンツハッシュを計算します。
 * 同じハッシュ値なら診断をスキップしてパフォーマンスを向上させます。
 *
 * djb2ハッシュは軽量で高速で、変更検出に適しています。
 * 完全な衝突回避ではなく、"変更されていない可能性が高い" という判定です。
 *
 * @param {string} content - ドキュメント全体のテキスト
 * @returns {string} 36進数のハッシュ値
 */
function hashContent(content) {
  // djb2ハッシュアルゴリズム
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    h = ((h << 5) - h) + char;  // h = h * 33 + char
    h = h & h; // 32ビット整数に変換
  }
  return h.toString(36);
}

// ═══════════════════════════════════════════
// 診断オブジェクト生成
// ═══════════════════════════════════════════

/**
 * 診断オブジェクト生成ヘルパー
 *
 * 指定された範囲とメッセージ、レベルから VS Code診断オブジェクトを生成します。
 *
 * @param {number} sl - スタート行（0-indexed）
 * @param {number} sc - スタート列（0-indexed）
 * @param {number} el - エンド行（0-indexed）
 * @param {number} ec - エンド列（0-indexed）
 * @param {string} msg - エラー・警告メッセージ
 * @param {string} level - 重要度 ("error", "warning", "hint")
 * @returns {vscode.Diagnostic} VS Code診断オブジェクト
 */
function mkDiag(sl, sc, el, ec, msg, level) {
  // ── 重要度の決定 ──
  const severity = level === 'error' ? vscode.DiagnosticSeverity.Error
    : level === 'hint' ? vscode.DiagnosticSeverity.Hint
    : vscode.DiagnosticSeverity.Warning;
  return new vscode.Diagnostic(
    new vscode.Range(sl, sc, el, ec),  // ドキュメント内の範囲
    msg,                                // ユーザーに表示するメッセージ
    severity                            // 表示スタイル（赤/黄/青）
  );
}

// ═══════════════════════════════════════════
// ブロック構造解析
// ═══════════════════════════════════════════

/**
 * マッチング閉じタグの位置を検索
 *
 * 指定タイプのブロック（#if, #for等）の開き位置から、
 * マッチング閉じタグ（</#if>, </#for>等）の位置を返します。
 *
 * ネストされたブロックにも対応（深さトラッキング）。
 *
 * @param {string} content - テンプレート内容
 * @param {number} startPos - 開きタグの直後の位置
 * @param {string} blockType - ブロックタイプ（"if", "for"等）
 * @returns {number} 閉じタグ位置、見つからなければ content.length
 *
 * @example
 * const content = '<#if ...>text</#if>';
 * const closeIdx = findClose(content, 10, 'if');
 * // closeIdx = content.indexOf('</#if>')
 */
function findClose(content, startPos, blockType) {
  // ── ネストされたブロックの深さトラッキング ──
  // 深さ1から開始し、開きタグで+1、閉じタグで-1
  const open = `<${blockType}`, close = `</${blockType}>`;
  let depth = 1, pos = startPos;
  while (depth > 0 && pos < content.length) {
    const no = content.indexOf(open, pos), nc = content.indexOf(close, pos);
    if (nc === -1) return content.length; // 閉じタグなし → EOFを返す
    if (no !== -1 && no < nc) {
      // 次の開きタグが先に見つかった → ネストの深さ+1
      depth++;
      pos = no + open.length;
    } else {
      // 次の閉じタグが先に見つかった → 深さ-1
      depth--;
      if (depth === 0) return nc; // マッチング閉じタグ
      pos = nc + close.length;
    }
  }
  return content.length;
}

// ═══════════════════════════════════════════
// 文字列類似度・タイポ検出
// ═══════════════════════════════════════════

/**
 * Levenshtein距離（編集距離）の計算
 *
 * 2つの文字列間の最小編集操作数を計算します。
 * タイポの可能性を判定するために使用（距離 <= 2）。
 *
 * 動的計画法で効率的に計算（O(m*n)時間計算量）。
 *
 * @param {string} a - 比較文字列1
 * @param {string} b - 比較文字列2
 * @returns {number} Levenshtein距離（0 = 完全一致、増加 = 差異が大きい）
 *
 * @example
 * lev('count', 'cunt')  // 1 (1文字削除で一致)
 * lev('name', 'name')   // 0 (完全一致)
 * lev('abc', 'xyz')     // 3 (すべて異なる)
 */
function lev(a, b) {
  // ── 動的計画法テーブルの初期化 ──
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  // 最初の行と列（基本ケース）
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  // ── テーブルを埋める ──
  // 各セル (i,j) は a[0..i] と b[0..j] の距離
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i-1][j]+1,                                    // 削除
        dp[i][j-1]+1,                                    // 挿入
        dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)  // 置換または一致
      );
  return dp[m][n];
}

// ═══════════════════════════════════════════
// モジュールエクスポート
// ═══════════════════════════════════════════
/**
 * VS Code拡張機能のエクスポート
 *
 * activate: 拡張機能ロード時に呼び出し（プロバイダー登録、イベントリスナー設定）
 * deactivate: 拡張機能アンロード時に呼び出し（リソース解放）
 */
module.exports = { activate, deactivate };
