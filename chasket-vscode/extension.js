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

// ── i18n: ロケール判定 ──
/** @returns {boolean} VSCodeが日本語環境かどうか */
function isJa() { return vscode.env.language.startsWith('ja'); }
/**
 * ロケールに応じた文字列を返す
 * @param {string} en - 英語テキスト
 * @param {string} ja - 日本語テキスト
 * @returns {string}
 */
function t(en, ja) { return isJa() ? ja : en; }

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
 * ワークスペース内のChasketコンポーネント名キャッシュ
 * キー: ファイルURI文字列、値: { tagName: string, filePath: string }
 * @type {Map<string, {tagName: string, filePath: string}>}
 */
const projectComponents = new Map();

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
  // JS組み込みAPIのドット補完（console. / window. / document. 等）
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('chasket', { provideCompletionItems: provideDotCompletion }, '.'));
  // 定義へのジャンプ: 識別子をクリックして宣言位置に移動
  context.subscriptions.push(vscode.languages.registerDefinitionProvider('chasket', { provideDefinition }));
  // ドキュメント アウトライン: 右側パネルにコンポーネント構造を表示
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('chasket', { provideDocumentSymbols }));

  // ── コンポーネント補完用のトリガー文字を追加 ──
  // '<' でコンポーネントタグ補完、'|' でイベント修飾子補完、'@' ':' でイベント・バインディング補完
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('chasket',
    { provideCompletionItems: provideComponentTagCompletion }, '<'));

  // ── ワークスペース内の .csk ファイルを検索してコンポーネント名をキャッシュ ──
  scanProjectComponents().catch(() => {/* initial scan best-effort */});

  // .cskファイルの作成・削除・変更を監視してキャッシュを更新
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.csk');
  watcher.onDidCreate(uri => scanSingleComponent(uri));
  watcher.onDidChange(uri => scanSingleComponent(uri));
  watcher.onDidDelete(uri => projectComponents.delete(uri.toString()));
  context.subscriptions.push(watcher);

  // 既に開いているChasketドキュメントに対して初期診断を実行
  vscode.workspace.textDocuments.forEach(doc => { if (doc.languageId === 'chasket') runDiagnostics(doc); });

  // ── FEATURE 4: chasket.config.json validation ──
  const configDiagCollection = vscode.languages.createDiagnosticCollection('chasket-config');
  context.subscriptions.push(configDiagCollection);

  // Validator function for chasket.config.json
  function validateChasketConfig(document) {
    if (!document.fileName.endsWith('chasket.config.json')) return;

    const diagnostics = [];
    try {
      const content = document.getText();
      const config = JSON.parse(content);

      const knownOptions = new Set(['src', 'out', 'outdir', 'target', 'optimize', 'sourceMap', 'html', 'bundle', 'shadow', 'minify']);

      for (const key of Object.keys(config)) {
        if (!knownOptions.has(key)) {
          const lineNum = content.split('\n').findIndex(line => line.includes(`"${key}"`));
          const line = lineNum >= 0 ? document.lineAt(lineNum).text : '';
          const col = line.indexOf(`"${key}"`);
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(lineNum >= 0 ? lineNum : 0, col >= 0 ? col : 0, lineNum >= 0 ? lineNum : 0, col + key.length + 2),
            t(`Unknown option '${key}'. Valid options: src, out, outdir, target, optimize, sourceMap, html, bundle, shadow, minify`, `不明なオプション '${key}'。有効なオプション: src, out, outdir, target, optimize, sourceMap, html, bundle, shadow, minify`),
            vscode.DiagnosticSeverity.Warning
          ));
        }
      }

      // Validate 'target' value
      if (config.target && !['js', 'ts'].includes(config.target)) {
        const lineNum = content.split('\n').findIndex(line => line.includes('"target"'));
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(lineNum >= 0 ? lineNum : 0, 0, lineNum >= 0 ? lineNum : 0, 100),
          t(`'target' must be 'js' or 'ts', got '${config.target}'`, `'target' は 'js' または 'ts' である必要があります。'${config.target}' を取得しました`),
          vscode.DiagnosticSeverity.Error
        ));
      }

      // Validate 'shadow' value
      if (config.shadow && !['open', 'closed', 'none'].includes(config.shadow)) {
        const lineNum = content.split('\n').findIndex(line => line.includes('"shadow"'));
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(lineNum >= 0 ? lineNum : 0, 0, lineNum >= 0 ? lineNum : 0, 100),
          t(`'shadow' must be 'open', 'closed', or 'none', got '${config.shadow}'`, `'shadow' は 'open'、'closed'、または 'none' である必要があります。'${config.shadow}' を取得しました`),
          vscode.DiagnosticSeverity.Error
        ));
      }

      // Validate boolean options
      for (const boolKey of ['optimize', 'sourceMap', 'minify']) {
        if (config[boolKey] !== undefined && typeof config[boolKey] !== 'boolean') {
          const lineNum = content.split('\n').findIndex(line => line.includes(`"${boolKey}"`));
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(lineNum >= 0 ? lineNum : 0, 0, lineNum >= 0 ? lineNum : 0, 100),
            t(`'${boolKey}' must be a boolean`, `'${boolKey}' はブール値である必要があります`),
            vscode.DiagnosticSeverity.Error
          ));
        }
      }

      // Validate string options
      for (const strKey of ['src', 'out', 'outdir', 'html', 'bundle']) {
        if (config[strKey] !== undefined && typeof config[strKey] !== 'string') {
          const lineNum = content.split('\n').findIndex(line => line.includes(`"${strKey}"`));
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(lineNum >= 0 ? lineNum : 0, 0, lineNum >= 0 ? lineNum : 0, 100),
            t(`'${strKey}' must be a string`, `'${strKey}' は文字列である必要があります`),
            vscode.DiagnosticSeverity.Error
          ));
        }
      }
    } catch (e) {
      // JSON parse error - VS Code will already show it
    }

    configDiagCollection.set(document.uri, diagnostics);
  }

  // Hover provider for chasket.config.json
  const configHoverProvider = {
    provideHover(document, position) {
      if (!document.fileName.endsWith('chasket.config.json')) return null;

      const wordRange = document.getWordRangeAtPosition(position, /\w+/);
      if (!wordRange) return null;

      const word = document.getText(wordRange);

      const optionDocs = {
        'src': t('Source directory (default: "src/components")', 'ソースディレクトリ（デフォルト: "src/components"）'),
        'out': t('Output directory (default: "dist")', '出力ディレクトリ（デフォルト: "dist"）'),
        'outdir': t('Output directory (default: "dist")', '出力ディレクトリ（デフォルト: "dist"）'),
        'target': t('Output format: "js" or "ts" (default: "js")', '出力形式: "js" または "ts"（デフォルト: "js"）'),
        'optimize': t('Enable optimization/minification (default: false)', '最適化/縮小を有効にする（デフォルト: false）'),
        'sourceMap': t('Generate source maps (default: true)', 'ソースマップを生成（デフォルト: true）'),
        'html': t('HTML entry point file path', 'HTMLエントリーポイントファイルパス'),
        'bundle': t('Bundle output filename (default: "chasket-bundle.js")', 'バンドル出力ファイル名（デフォルト: "chasket-bundle.js"）'),
        'shadow': t('Shadow DOM mode: "open", "closed", or "none" (default: "open")', 'Shadow DOMモード: "open"、"closed"、または "none"（デフォルト: "open"）'),
        'minify': t('Enable minification (default: false)', '縮小を有効にする（デフォルト: false）'),
      };

      if (optionDocs[word]) {
        const md = `**${word}**\n\n${optionDocs[word]}`;
        const h = new vscode.MarkdownString(md);
        h.isTrusted = true;
        return new vscode.Hover(h, wordRange);
      }

      return null;
    }
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'file', language: 'json' }, configHoverProvider));

  // Register event listeners for chasket.config.json
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => validateChasketConfig(doc)),
    vscode.workspace.onDidOpenTextDocument(doc => validateChasketConfig(doc)),
    vscode.workspace.onDidChangeTextDocument(e => validateChasketConfig(e.document))
  );

  // Validate all open chasket.config.json files
  vscode.workspace.textDocuments.forEach(doc => validateChasketConfig(doc));
}

/**
 * ワークスペース内の全 .csk ファイルをスキャンしてコンポーネント名をキャッシュ
 */
async function scanProjectComponents() {
  const files = await vscode.workspace.findFiles('**/*.csk', '**/node_modules/**', 500);
  for (const uri of files) {
    await scanSingleComponent(uri);
  }
}

/**
 * 単一の .csk ファイルからコンポーネント名を抽出してキャッシュ
 * @param {vscode.Uri} uri
 */
async function scanSingleComponent(uri) {
  try {
    const content = (await vscode.workspace.fs.readFile(uri)).toString();
    const metaMatch = content.match(/<meta[^>]*>([\s\S]*?)<\/meta>/);
    if (!metaMatch) {
      // metaブロックがない場合はファイル名からタグ名を推測
      const basename = path.basename(uri.fsPath, '.csk');
      const tagName = basename.includes('-') ? basename : `x-${basename}`;
      projectComponents.set(uri.toString(), { tagName, filePath: uri.fsPath });
      return;
    }
    const nameMatch = metaMatch[1].match(/^\s*name\s*:\s*["']?([^\s"']+)["']?\s*$/m);
    if (nameMatch) {
      projectComponents.set(uri.toString(), { tagName: nameMatch[1], filePath: uri.fsPath });
    } else {
      const basename = path.basename(uri.fsPath, '.csk');
      const tagName = basename.includes('-') ? basename : `x-${basename}`;
      projectComponents.set(uri.toString(), { tagName, filePath: uri.fsPath });
    }
  } catch {
    // ファイル読み取りエラーは無視
  }
}

/**
 * テンプレート内でカスタムコンポーネントタグの補完を提供
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {vscode.CompletionItem[]}
 */
function provideComponentTagCompletion(document, position) {
  const block = detectBlock(document, position.line);
  if (block !== 'template') return [];

  const line = document.lineAt(position).text;
  const beforeCursor = line.substring(0, position.character);
  // '<' の直後、またはタグ名入力中のみ
  if (!beforeCursor.match(/<[\w-]*$/)) return [];

  const currentUri = document.uri.toString();
  const items = [];

  for (const [uri, comp] of projectComponents) {
    if (uri === currentUri) continue; // 自分自身は除外
    const item = new vscode.CompletionItem(comp.tagName, vscode.CompletionItemKind.Class);
    item.detail = `Chasket: ${path.basename(comp.filePath)}`;
    item.documentation = new vscode.MarkdownString(t(
      `Custom component \`<${comp.tagName}>\`\n\nFile: \`${vscode.workspace.asRelativePath(comp.filePath)}\``,
      `カスタムコンポーネント \`<${comp.tagName}>\`\n\nファイル: \`${vscode.workspace.asRelativePath(comp.filePath)}\``
    ));
    item.insertText = new vscode.SnippetString(`${comp.tagName}$1></${comp.tagName}>`);
    item.sortText = `0-${comp.tagName}`;
    items.push(item);
  }

  return items;
}

// ═══════════════════════════════════════════
// IMPORT MEMBER RESOLUTION
// ═══════════════════════════════════════════

/**
 * インポート元ファイルを解決し、ファイルパスを返す
 * @param {vscode.TextDocument} document - 現在のドキュメント
 * @param {{ importPath: string }} sym - インポートシンボル情報
 * @returns {string|null} 解決されたファイルパス
 */
function resolveImportFile(document, sym) {
  try {
    const docDir = path.dirname(document.uri.fsPath);
    const resolvedPath = path.resolve(docDir, sym.importPath);
    const extensions = ['.ts', '.js', '.d.ts'];
    for (const ext of extensions) {
      const candidate = resolvedPath + ext;
      if (fs.existsSync(candidate)) return candidate;
    }
    if (fs.existsSync(resolvedPath)) return resolvedPath;
  } catch { /* ignore */ }
  return null;
}

/**
 * インポート元ファイル内でメンバー（メソッド/プロパティ）の定義行を検索
 * @param {string} filePath - ソースファイルパス
 * @param {string} memberName - 検索するメンバー名
 * @returns {{ line: number, signature: string }|null} 見つかった行番号と定義文字列
 */
function findMemberInFile(filePath, memberName) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const escaped = memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // パターン: メソッド定義、関数宣言、プロパティ、static メンバー
    const patterns = [
      new RegExp(`^\\s*(?:static\\s+)?(?:async\\s+)?${escaped}\\s*\\(`),                    // method(
      new RegExp(`^\\s*(?:export\\s+)?(?:static\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`), // function name
      new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\b`),                  // const name
      new RegExp(`^\\s*(?:public|private|protected)?\\s*(?:static\\s+)?(?:readonly\\s+)?${escaped}\\s*[:(=]`), // class field
      new RegExp(`^\\s*(?:export\\s+)?(?:type|interface)\\s+${escaped}\\b`),                  // type/interface
      new RegExp(`^\\s*(?:get|set)\\s+${escaped}\\s*\\(`),                                   // getter/setter
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          return { line: i, signature: lines[i].trim() };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * インポートされたオブジェクトのメンバーに対するホバー情報を構築
 * @param {vscode.TextDocument} document
 * @param {Object} sym - インポートシンボル
 * @param {string} memberName - メンバー名
 * @returns {string|null} Markdown ホバーテキスト
 */
function resolveImportMember(document, sym, memberName) {
  const filePath = resolveImportFile(document, sym);
  if (!filePath) return null;

  const result = findMemberInFile(filePath, memberName);
  if (!result) return null;

  const relFile = vscode.workspace.asRelativePath(filePath);
  let md = `**${memberName}**\n\n`;
  md += `\`\`\`typescript\n${result.signature}\n\`\`\`\n\n`;
  md += `${t('Defined in', '定義元')}: \`${relFile}\` (${t('line', '行')} ${result.line + 1})\n`;
  return md;
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

let _hoverCache = null;
function getHover() {
  if (_hoverCache) return _hoverCache;
  const ja = isJa();
  _hoverCache = {
    // ── Script declarations ──
    'state': ja ? '**state** — リアクティブ変数\n\n内部状態を宣言します。値を変更するとテンプレートが自動更新されます。\n\n```chasket\nstate count: number = 0\nstate name: string = "hello"\nstate items: string[] = []\n```\n\n型注釈と初期値が必須です。' : '**state** — Reactive variable\n\nDeclares internal state. When you modify the value, the template automatically updates.\n\n```chasket\nstate count: number = 0\nstate name: string = "hello"\nstate items: string[] = []\n```\n\nType annotation and initial value are required.',
    'const': ja ? '**const** — 非リアクティブ定数\n\nコンポーネント内で使用するプライベート定数を宣言します。\n値の変更はDOMに反映されません。\n\n```chasket\nconst MAX_COUNT = 100\nconst API_URL: string = "https://api.example.com"\nconst handler = () => console.log("click")\n```\n\n型注釈は省略可能。イベントハンドラとしても使えます: `@click="handler"`' : '**const** — Non-reactive constant\n\nDeclares a private constant for use within the component.\nValue changes do not reflect in the DOM.\n\n```chasket\nconst MAX_COUNT = 100\nconst API_URL: string = "https://api.example.com"\nconst handler = () => console.log("click")\n```\n\nType annotation is optional. Can also be used as an event handler: `@click="handler"`',
    'let': ja ? '**let** — 非リアクティブ変数\n\nコンポーネント内で使用するプライベート変数を宣言します。\n値の変更はDOMに反映されません（stateとの違い）。\n\n```chasket\nlet counter = 0\nlet cache: object = {}\n```\n\n型注釈は省略可能。DOM更新が不要な内部状態に使います。' : '**let** — Non-reactive variable\n\nDeclares a private variable for use within the component.\nValue changes do not reflect in the DOM (unlike state).\n\n```chasket\nlet counter = 0\nlet cache: object = {}\n```\n\nType annotation is optional. Use for internal state that doesn\'t require DOM updates.',
    'prop': ja ? '**prop** — 外部属性\n\n親から受け取る属性を宣言します。HTML属性として反映・監視されます。\n\n```chasket\nprop label: string               // 必須\nprop size: number = 16            // デフォルト付き\nprop disabled: boolean = false\n```\n\n型による反映: `string` → getAttribute, `number` → parseFloat, `boolean` → 属性の有無' : '**prop** — External attribute\n\nDeclares an attribute received from the parent. Reflected and observed as an HTML attribute.\n\n```chasket\nprop label: string               // required\nprop size: number = 16            // with default\nprop disabled: boolean = false\n```\n\nReflection by type: `string` → getAttribute, `number` → parseFloat, `boolean` → presence of attribute',
    'computed': ja ? '**computed** — 派生値\n\nstate/propから自動計算される読み取り専用の値です。依存値が変わると再計算されます。\n\n```chasket\ncomputed total: number = items.reduce((s, i) => s + i.price, 0)\ncomputed isValid: boolean = name.length > 0\n```' : '**computed** — Derived value\n\nA read-only value automatically calculated from state/prop. Recomputed when dependencies change.\n\n```chasket\ncomputed total: number = items.reduce((s, i) => s + i.price, 0)\ncomputed isValid: boolean = name.length > 0\n```',
    'fn': ja ? '**fn** — 関数定義\n\nコンポーネントのプライベートメソッドを定義します。\n内部でstateを変更するとDOMが自動更新されます。\n\n```chasket\nfn increment() {\n  count += 1\n}\n\nfn greet(name: string): string {\n  return `Hello, ${name}!`\n}\n\nfn async fetchData() {\n  data = await fetch("/api").then(r => r.json())\n}\n```\n\n**コンパイル結果**: `fn` はクラスの **private メソッド** (`#name()`) に変換されます。\n`this` はコンポーネントインスタンスを指します（Arrow関数ではありません）。\n\n**イベントハンドラとして使う場合**:\n- `@click="increment"` → `(e) => { this.#increment(e); this.#update(); }` に展開\n- ハンドラには `e` (イベントオブジェクト) が自動的に第1引数として渡されます\n- `state` 変数に関数を格納して渡すことも可能です' : '**fn** — Function definition\n\nDefines a private method for the component.\nChanges to state within the function automatically update the DOM.\n\n```chasket\nfn increment() {\n  count += 1\n}\n\nfn greet(name: string): string {\n  return `Hello, ${name}!`\n}\n\nfn async fetchData() {\n  data = await fetch("/api").then(r => r.json())\n}\n```\n\n**Compiled result**: `fn` is converted to a **private method** (`#name()`) of the class.\n`this` refers to the component instance (not an arrow function).\n\n**When used as an event handler**:\n- `@click="increment"` → expands to `(e) => { this.#increment(e); this.#update(); }`\n- The handler automatically receives `e` (the event object) as the first argument\n- You can also store a function in a `state` variable and pass it',
    'emit': ja ? '**emit** — カスタムイベント\n\n親へ通知するイベントを宣言します。CustomEventとしてdispatchされます。\n\n```chasket\nemit close: { reason: string }        // デフォルト (bubbles+composed)\nemit(bubbles) notify: void             // バブリングのみ\nemit(composed) select: { id: number }  // Shadow DOM越えのみ\nemit(local) internal: void             // 自身のみ\n```\n\nオプション: `bubbles`, `composed`, `local`\n省略時: `bubbles: true, composed: true`' : '**emit** — Custom event\n\nDeclares an event to notify the parent. Dispatched as a CustomEvent.\n\n```chasket\nemit close: { reason: string }        // default (bubbles+composed)\nemit(bubbles) notify: void             // bubbling only\nemit(composed) select: { id: number }  // across Shadow DOM only\nemit(local) internal: void             // self only\n```\n\nOptions: `bubbles`, `composed`, `local`\nDefault: `bubbles: true, composed: true`',
    'ref': ja ? '**ref** — DOM参照\n\nテンプレート内のDOM要素への直接参照を取得します。\n\n```chasket\nref canvas: HTMLCanvasElement\n\non mount {\n  const ctx = canvas.getContext("2d")\n}\n```\n\nテンプレート側: `<canvas ref="canvas" />`' : '**ref** — DOM reference\n\nAcquires a direct reference to a DOM element in the template.\n\n```chasket\nref canvas: HTMLCanvasElement\n\non mount {\n  const ctx = canvas.getContext("2d")\n}\n```\n\nIn template: `<canvas ref="canvas" />`',
    'watch': ja ? '**watch** — 副作用\n\n値の変更時にDOM以外の副作用を実行します。\n\n```chasket\nwatch(count) {\n  localStorage.setItem("count", String(count))\n}\n```' : '**watch** — Side effect\n\nExecutes side effects other than DOM updates when a value changes.\n\n```chasket\nwatch(count) {\n  localStorage.setItem("count", String(count))\n}\n```',
    'provide': ja ? '**provide** — コンテキスト提供\n\n子孫コンポーネントにデータを提供します。\n\n```chasket\nprovide theme: Theme = { mode: "dark" }\n```' : '**provide** — Context provision\n\nProvides data to descendant components.\n\n```chasket\nprovide theme: Theme = { mode: "dark" }\n```',
    'consume': ja ? '**consume** — コンテキスト受信\n\n祖先の `provide` からデータを受信します。\n\n```chasket\nconsume theme: Theme\n```' : '**consume** — Context consumption\n\nReceives data from an ancestor\'s `provide`.\n\n```chasket\nconsume theme: Theme\n```',
    'on': ja ? '**on** — ライフサイクルフック\n\n```chasket\non mount {          // connectedCallback\n  // 初期化処理\n  return () => {}   // クリーンアップ（unmount時に実行）\n}\n\non unmount {        // disconnectedCallback\n}\n\non update(label) {  // attributeChangedCallback\n}\n```' : '**on** — Lifecycle hook\n\n```chasket\non mount {          // connectedCallback\n  // initialization\n  return () => {}   // cleanup (runs on unmount)\n}\n\non unmount {        // disconnectedCallback\n}\n\non update(label) {  // attributeChangedCallback\n}\n```',
    'import': ja ? '**import** — インポート\n\n他のChasketコンポーネントやTS/JSモジュールを読み込みます。\n\n```chasket\nimport XButton from "./button.csk"\nimport { formatDate } from "./utils.ts"\n```\n\nバンドル内ではタグ名で自動参照されるため、import文は省略可能ですが、\n将来のコンパイル時型チェックのために記述を推奨します。' : '**import** — Import\n\nLoads other Chasket components or TS/JS modules.\n\n```chasket\nimport XButton from "./button.csk"\nimport { formatDate } from "./utils.ts"\n```\n\nWithin bundles, tag names are auto-referenced, so import statements are optional.\nHowever, we recommend writing them for future compile-time type checking.',
    'type': ja ? '**type** — 型エイリアス\n\nTypeScript互換の型定義です。\n\n```chasket\ntype User = { name: string, age: number, email?: string }\ntype Status = "idle" | "loading" | "error"\ntype Result<T> = { ok: true, data: T } | { ok: false, error: string }\n```' : '**type** — Type alias\n\nTypeScript-compatible type definitions.\n\n```chasket\ntype User = { name: string, age: number, email?: string }\ntype Status = "idle" | "loading" | "error"\ntype Result<T> = { ok: true, data: T } | { ok: false, error: string }\n```',
    'async': ja ? '**async** — 非同期関数\n\n`fn async` で非同期関数を定義します。\n\n```chasket\nfn async fetchUser(id: string) {\n  user = await fetch(`/api/users/${id}`).then(r => r.json())\n}\n```' : '**async** — Async function\n\nDefines an async function with `fn async`.\n\n```chasket\nfn async fetchUser(id: string) {\n  user = await fetch(`/api/users/${id}`).then(r => r.json())\n}\n```',
    ':else-if': ja ? '**:else-if** — else-if 分岐\n\n`#if` ブロック内で追加の条件分岐を指定します。\n\n```chasket\n<#if condition="status === \'ok\'">\n  <p>成功</p>\n<:else-if condition="status === \'loading\'">\n  <p>読み込み中...</p>\n<:else>\n  <p>エラー</p>\n</#if>\n```' : '**:else-if** — else-if branching\n\nSpecifies additional conditional branching within `#if` blocks.\n\n```chasket\n<#if condition="status === \'ok\'">\n  <p>Success</p>\n<:else-if condition="status === \'loading\'">\n  <p>Loading...</p>\n<:else>\n  <p>Error</p>\n</#if>\n```',

    // ── Template directives ──
    '#if': ja ? '**#if** — 条件分岐\n\n```chasket\n<#if condition="user != null">\n  <p>{{ user.name }}</p>\n<:else-if condition="isLoading">\n  <p>読み込み中...</p>\n<:else>\n  <p>ログインしてください</p>\n</#if>\n```\n\n必須: `condition` 属性' : '**#if** — Conditional branching\n\n```chasket\n<#if condition="user != null">\n  <p>{{ user.name }}</p>\n<:else-if condition="isLoading">\n  <p>Loading...</p>\n<:else>\n  <p>Please log in</p>\n</#if>\n```\n\nRequired: `condition` attribute',
    '#for': ja ? '**#for** — ループ\n\n```chasket\n<#for each="item" of="items" key="item.id">\n  <li>{{ item.name }}</li>\n</#for>\n\n// インデックス付き\n<#for each="item, index" of="items" key="item.id">\n  <li>{{ index + 1 }}. {{ item.name }}</li>\n  <:empty>\n    <p>空です</p>\n  </:empty>\n</#for>\n```\n\n必須: `each`, `of`, `key`' : '**#for** — Loop\n\n```chasket\n<#for each="item" of="items" key="item.id">\n  <li>{{ item.name }}</li>\n</#for>\n\n// with index\n<#for each="item, index" of="items" key="item.id">\n  <li>{{ index + 1 }}. {{ item.name }}</li>\n  <:empty>\n    <p>Empty</p>\n  </:empty>\n</#for>\n```\n\nRequired: `each`, `of`, `key`',

    // ── Directive attributes ──
    'each': ja ? '**each** — ループ変数名 (#for 必須)\n\n各要素を受け取る変数名。カンマでインデックスも取得可能。\n\n```\neach="item"          // 要素のみ\neach="item, index"   // 要素 + インデックス\n```' : '**each** — Loop variable name (required for #for)\n\nVariable name that receives each element. Index can also be obtained with comma separation.\n\n```\neach="item"          // element only\neach="item, index"   // element + index\n```',
    'of': ja ? '**of** — ループ対象の配列 (#for 必須)\n\nstate/propの配列名を指定します。\n\n```\nof="items"    // state items をループ\n```' : '**of** — Array to loop over (required for #for)\n\nSpecifies the name of a state/prop array.\n\n```\nof="items"    // loop over state items\n```',
    'key': ja ? '**key** — 一意キー (#for 必須)\n\n各アイテムを識別するキー式。DOM更新の効率化に必須。\n\n```\nkey="item.id"   // オブジェクトのIDフィールド\nkey="item"      // プリミティブ値そのもの\n```' : '**key** — Unique key (required for #for)\n\nKey expression to identify each item. Essential for efficient DOM updates.\n\n```\nkey="item.id"   // ID field of object\nkey="item"      // primitive value itself\n```',
    'condition': ja ? '**condition** — 条件式 (#if 必須)\n\nJavaScript式として評価されます。\n\n```\ncondition="user != null"\ncondition="count > 0"\ncondition="status === \'loading\'"\n```' : '**condition** — Condition expression (required for #if)\n\nEvaluated as a JavaScript expression.\n\n```\ncondition="user != null"\ncondition="count > 0"\ncondition="status === \'loading\'"\n```',

    // ── Template attributes ──
    ':bind': ja ? '**:bind** — 双方向バインディング\n\nフォーム要素とstateを同期します。\n\n```chasket\n<input :bind="name" />\n<textarea :bind="desc" />\n<select :bind="selected">...</select>\n```\n\nvalue属性 + input/changeイベントに展開されます。' : '**:bind** — Two-way binding\n\nSynchronizes form elements with state.\n\n```chasket\n<input :bind="name" />\n<textarea :bind="desc" />\n<select :bind="selected">...</select>\n```\n\nExpands to value attribute + input/change events.',
    ':class': ja ? '**:class** — 動的クラス\n\n```chasket\n<div :class="{ active: isActive, bold: isBold }">\n<div :class="[base, isActive && \'active\']">\n```' : '**:class** — Dynamic class\n\n```chasket\n<div :class="{ active: isActive, bold: isBold }">\n<div :class="[base, isActive && \'active\']">\n```',
    ':style': ja ? '**:style** — 動的スタイル\n\n```chasket\n<div :style="{ color: textColor, fontSize: `${size}px` }">\n```' : '**:style** — Dynamic style\n\n```chasket\n<div :style="{ color: textColor, fontSize: `${size}px` }">\n```',
    '@html': ja ? '**@html** — 生HTML注入\n\n⚠️ エスケープされません。XSSリスクに注意。\n\n```chasket\n<div @html="richContent"></div>\n```\n\n通常の `{{ }}` は自動エスケープされます。' : '**@html** — Raw HTML injection\n\n⚠️ Not escaped. Be careful of XSS risks.\n\n```chasket\n<div @html="richContent"></div>\n```\n\nRegular `{{ }}` is automatically escaped.',
    'slot': ja ? '**slot** — スロット\n\nWeb Component標準。親からコンテンツを挿入できます。\n\n```chasket\n// 子: <slot>デフォルト</slot>\n// 子: <slot name="header"></slot>\n// 親: <x-card><h2 slot="header">タイトル</h2></x-card>\n```' : '**slot** — Slot\n\nWeb Component standard. Content can be inserted from the parent.\n\n```chasket\n// child: <slot>default</slot>\n// child: <slot name="header"></slot>\n// parent: <x-card><h2 slot="header">Title</h2></x-card>\n```',

    // ── Meta fields ──
    'name': ja ? '**name** — カスタム要素タグ名\n\nハイフンを1つ以上含む必要があります。\n\n```chasket\n<meta>\n  name: "x-button"\n</meta>\n```\n\n省略時はファイル名から自動生成されます。' : '**name** — Custom element tag name\n\nMust contain at least one hyphen.\n\n```chasket\n<meta>\n  name: "x-button"\n</meta>\n```\n\nAuto-generated from filename if omitted.',
    'shadow': ja ? '**shadow** — Shadow DOMモード\n\n```\nshadow: open     // 外部からアクセス可能（デフォルト）\nshadow: closed   // 外部からアクセス不可\nshadow: none     // Shadow DOM不使用\n```\n\n`none` はTailwind等の外部CSSと併用する場合に便利です。' : '**shadow** — Shadow DOM mode\n\n```\nshadow: open     // accessible from outside (default)\nshadow: closed   // not accessible from outside\nshadow: none     // Shadow DOM not used\n```\n\n`none` is useful when using external CSS like Tailwind.',
    'form': ja ? '**form** — フォーム連携\n\nコンポーネントをForm-Associated Custom Elementにします。\n\n```chasket\n<meta>\n  name: x-input\n  form: true\n</meta>\n```\n\n有効にすると:\n- `setFormValue(value)` でフォーム値を設定\n- `setValidity(flags, message)` でバリデーション\n- `on formReset { }` 等のフォームライフサイクル使用可\n- `form`, `validity`, `checkValidity()` 等のAPI自動公開' : '**form** — Form integration\n\nMakes the component a Form-Associated Custom Element.\n\n```chasket\n<meta>\n  name: x-input\n  form: true\n</meta>\n```\n\nWhen enabled:\n- Set form value with `setFormValue(value)`\n- Validate with `setValidity(flags, message)`\n- Use form lifecycle like `on formReset { }`\n- Auto-expose APIs like `form`, `validity`, `checkValidity()`',
    'generic': ja ? '**generic** — ジェネリック型パラメータ\n\nコンポーネントに型パラメータを宣言し、再利用可能な型安全コンポーネントを作成。\n\n```chasket\n<meta>\n  name: x-list\n  generic: T\n</meta>\n\n<script>\n  state items: T[] = []\n  prop renderer: (item: T) => string = String\n</script>\n```\n\n制約付きパラメータ:\n```chasket\ngeneric: T extends string, U = number\n```\n\n`.d.ts` 出力にジェネリックが反映されます。' : '**generic** — Generic type parameters\n\nDeclare type parameters on the component to create reusable, type-safe components.\n\n```chasket\n<meta>\n  name: x-list\n  generic: T\n</meta>\n\n<script>\n  state items: T[] = []\n  prop renderer: (item: T) => string = String\n</script>\n```\n\nConstrained parameters:\n```chasket\ngeneric: T extends string, U = number\n```\n\nGenerics are reflected in `.d.ts` output.',

    // ── Form lifecycle ──
    'formReset': ja ? '**on formReset** — フォームリセット\n\nフォームの `reset` 時に呼ばれます。初期値への復元処理を記述。\n\n```chasket\non formReset {\n  value = ""\n  setFormValue("")\n}\n```' : '**on formReset** — Form reset\n\nCalled when the form is `reset`. Write logic to restore initial values.\n\n```chasket\non formReset {\n  value = ""\n  setFormValue("")\n}\n```',
    'update': ja ? '**on update** — 属性変更コールバック\n\n`prop` の属性が変更された時に呼ばれます。`attributeChangedCallback` に対応。\n\n```chasket\non update(label) {\n  // label propが変更された時の処理\n  console.log("label changed to:", label)\n}\n\non update {\n  // 任意の監視対象propが変更された時\n}\n```\n\n引数を指定すると特定のpropの変更のみを監視します。' : '**on update** — Attribute change callback\n\nCalled when a `prop` attribute changes. Corresponds to `attributeChangedCallback`.\n\n```chasket\non update(label) {\n  // handle when label prop changes\n  console.log("label changed to:", label)\n}\n\non update {\n  // when any watched prop changes\n}\n```\n\nSpecifying an argument monitors changes to only that specific prop.',
    'error': ja ? '**on error** — エラーハンドリング\n\nコンポーネント内で未捕捉のエラーが発生した時に呼ばれます。\n\n```chasket\non error(err) {\n  console.error("Component error:", err)\n  errorMessage = err.message\n}\n```\n\nレンダリングエラーやライフサイクルフック内のエラーをキャッチできます。' : '**on error** — Error handling\n\nCalled when an uncaught error occurs within the component.\n\n```chasket\non error(err) {\n  console.error("Component error:", err)\n  errorMessage = err.message\n}\n```\n\nCan catch rendering errors and errors in lifecycle hooks.',
    'formAssociated': ja ? '**on formAssociated** — フォーム関連付け\n\nコンポーネントが `<form>` に関連付けられた時に呼ばれます。\n\n```chasket\non formAssociated {\n  // form がセットされた\n}\n```' : '**on formAssociated** — Form association\n\nCalled when the component is associated with a `<form>`.\n\n```chasket\non formAssociated {\n  // form has been set\n}\n```',
    'formDisabled': ja ? '**on formDisabled** — フォーム無効化\n\n`<fieldset disabled>` 等でフォーム要素が無効化された時に呼ばれます。\n\n```chasket\non formDisabled {\n  // disabled 状態の処理\n}\n```' : '**on formDisabled** — Form disabling\n\nCalled when the form element is disabled by `<fieldset disabled>` or similar.\n\n```chasket\non formDisabled {\n  // handle disabled state\n}\n```',
    'formStateRestore': ja ? '**on formStateRestore** — フォーム状態復元\n\nブラウザによるフォーム状態の自動復元時に呼ばれます。\n\n```chasket\non formStateRestore {\n  // state, mode が引数として渡される\n}\n```' : '**on formStateRestore** — Form state restoration\n\nCalled when the browser automatically restores form state.\n\n```chasket\non formStateRestore {\n  // state and mode are passed as arguments\n}\n```',
    'setFormValue': ja ? '**setFormValue** — フォーム値設定\n\n`form: true` 時に使用可能。`ElementInternals.setFormValue()` を呼びます。\n\n```chasket\nsetFormValue(value)          // 文字列\nsetFormValue(value, state)   // 値とブラウザ復元用状態\nsetFormValue(formData)       // FormDataオブジェクト\n```' : '**setFormValue** — Set form value\n\nAvailable when `form: true`. Calls `ElementInternals.setFormValue()`.\n\n```chasket\nsetFormValue(value)          // string\nsetFormValue(value, state)   // value and state for browser restoration\nsetFormValue(formData)       // FormData object\n```',
    'setValidity': ja ? '**setValidity** — バリデーション設定\n\n`form: true` 時に使用可能。`ElementInternals.setValidity()` を呼びます。\n\n```chasket\nsetValidity({ valueMissing: true }, "入力必須です")\nsetValidity({})              // バリデーションをクリア\n```' : '**setValidity** — Set validity\n\nAvailable when `form: true`. Calls `ElementInternals.setValidity()`.\n\n```chasket\nsetValidity({ valueMissing: true }, "Required input")\nsetValidity({})              // clear validation\n```',
  };
  return _hoverCache;
}

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
  if (getHover()[word]) {
    if (!META_ONLY_HOVER_KEYS.has(word)) {
      return mkHover(getHover()[word], wordRange);
    }
    // メタ専用キーワードは <meta> ブロック内のみマッチ
    const block = detectBlock(document, position.line);
    if (block === 'meta') {
      return mkHover(getHover()[word], wordRange);
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
      // Mouse
      'click': 'MouseEvent', 'dblclick': 'MouseEvent', 'mousedown': 'MouseEvent',
      'mouseup': 'MouseEvent', 'mousemove': 'MouseEvent', 'mouseenter': 'MouseEvent',
      'mouseleave': 'MouseEvent', 'mouseover': 'MouseEvent', 'mouseout': 'MouseEvent',
      'contextmenu': 'MouseEvent',
      // Keyboard
      'keydown': 'KeyboardEvent', 'keyup': 'KeyboardEvent', 'keypress': 'KeyboardEvent',
      // Form / Input
      'input': 'InputEvent', 'change': 'Event', 'select': 'Event', 'invalid': 'Event',
      'submit': 'SubmitEvent', 'reset': 'Event',
      // Focus
      'focus': 'FocusEvent', 'blur': 'FocusEvent',
      'focusin': 'FocusEvent', 'focusout': 'FocusEvent',
      // Pointer
      'pointerdown': 'PointerEvent', 'pointerup': 'PointerEvent', 'pointermove': 'PointerEvent',
      'pointerover': 'PointerEvent', 'pointerout': 'PointerEvent',
      'pointerenter': 'PointerEvent', 'pointerleave': 'PointerEvent', 'pointercancel': 'PointerEvent',
      // Touch
      'touchstart': 'TouchEvent', 'touchend': 'TouchEvent', 'touchmove': 'TouchEvent',
      'touchcancel': 'TouchEvent',
      // Drag & Drop
      'drag': 'DragEvent', 'dragstart': 'DragEvent', 'dragend': 'DragEvent',
      'dragenter': 'DragEvent', 'dragleave': 'DragEvent', 'dragover': 'DragEvent', 'drop': 'DragEvent',
      // Scroll / Resize / Wheel
      'scroll': 'Event', 'resize': 'UIEvent', 'wheel': 'WheelEvent',
      // Clipboard
      'copy': 'ClipboardEvent', 'cut': 'ClipboardEvent', 'paste': 'ClipboardEvent',
      // Composition (IME)
      'compositionstart': 'CompositionEvent', 'compositionupdate': 'CompositionEvent',
      'compositionend': 'CompositionEvent',
      // Animation / Transition
      'animationstart': 'AnimationEvent', 'animationend': 'AnimationEvent',
      'animationiteration': 'AnimationEvent',
      'transitionend': 'TransitionEvent', 'transitionstart': 'TransitionEvent', 'transitionrun': 'TransitionEvent',
      // Other
      'load': 'Event', 'error': 'ErrorEvent', 'abort': 'Event',
      'toggle': 'Event', 'close': 'Event', 'cancel': 'Event',
      'beforeinput': 'InputEvent', 'slotchange': 'Event',
    };
    const evType = eventTypeMap[evName] || 'Event';
    let md = `**@${evName}** — ${t('Event listener', 'イベントリスナー')}\n\n`;
    md += `${t(`\`${evName}\` event fires and triggers the handler.`, `\`${evName}\` イベント発火時にハンドラを実行します。`)}\n\n`;
    md += `**${t('Event type', 'イベント型')}**: \`${evType}\`\n\n`;
    md += '```chasket\n';
    md += `${t('// Pass function name defined with fn (e is automatically passed)', '// fn で定義した関数名を渡す（e は自動的に渡されます）')}\n`;
    md += `<button @${word.slice(1)}="handleClick">...</button>\n\n`;
    md += `${t('// Expression is also possible', '// 式も記述可能')}\n`;
    md += `<button @${word.slice(1)}="count += 1">...</button>\n\n`;
    md += `${t('// Pass event object (e) to function', '// e (イベントオブジェクト) を関数に渡す')}\n`;
    md += `<input @${word.slice(1)}="handleInput(e)">...</input>\n`;
    md += '```\n\n';
    md += `${t(`Within the handler, access the \`${evType}\` object via \`e\`.`, `ハンドラ内では \`e\` で \`${evType}\` オブジェクトにアクセスできます。`)}\n\n`;
    md += `**${t('Values you can pass', '渡せる値')}**:\n`;
    md += `${t('- Function name from `fn` definition (`e` automatically passed as 1st argument)', '- `fn` 定義の関数名（`e` が自動的に第1引数として渡される）')}\n`;
    md += `${t('- `state` variable (if holding function, called with `e` as argument)', '- `state` 変数（関数を保持している場合、`e` を引数に呼ばれる）')}\n`;
    md += `${t('- Any expression (`count += 1`, `doSomething(e)`, etc.)', '- 任意の式（`count += 1`、`doSomething(e)` など）')}\n\n`;
    if (mods.length) {
      const modDoc = {
        'prevent': t('`e.preventDefault()` — Prevent default behavior', '`e.preventDefault()` — デフォルト動作を防止'),
        'stop': t('`e.stopPropagation()` — Stop bubbling', '`e.stopPropagation()` — バブリングを停止'),
        'once': t('Execute once and auto-remove', '一度だけ実行し自動削除'),
        'self': t('Only if target is the element itself', 'ターゲットが自分自身の場合のみ'),
        'capture': t('Execute in capture phase', 'キャプチャフェーズで実行'),
        'enter': t('Only Enter key', 'Enterキーのみ反応'),
        'esc': t('Only Escape key', 'Escapeキーのみ反応'),
      };
      md += `**${t('Modifiers', '修飾子')}**:\n`;
      mods.forEach(m => { md += `- \`|${m}\` — ${modDoc[m] || t('Unknown modifier', '不明な修飾子')}\n`; });
    }
    return mkHover(md, wordRange);
  }

  // ── :directive （:bind, :class, :style 等の動的バインディング） ──
  if (word.startsWith(':') && word.length > 1) {
    const attr = word.slice(1);
    const bindDocs = {
      'bind': t('Two-way data binding. Synchronize form element value with state.', '双方向データバインディング。フォーム要素の値とstateを同期。'),
      'class': t('Dynamic class. Object `{ active: bool }` or array `[cls1, cls2]`.', '動的クラス。オブジェクト `{ active: bool }` または配列 `[cls1, cls2]`。'),
      'style': t('Dynamic style. Object `{ color: val, fontSize: val }`.', '動的スタイル。オブジェクト `{ color: val, fontSize: val }`。'),
      'disabled': t('Dynamic disabled. `true` to add disabled attribute, `false` to remove.', '動的disabled。`true` で disabled属性を付与、`false` で削除。'),
      'checked': t('Dynamic checked. Control checkbox state.', '動的checked。チェックボックスの状態を制御。'),
      'hidden': t('Dynamic hidden. `true` to hide.', '動的hidden。`true` で非表示。'),
      'src': t('Dynamic src. Set image or script URL dynamically.', '動的src。画像やスクリプトのURLを動的に設定。'),
      'href': t('Dynamic href. Set link destination dynamically.', '動的href。リンク先を動的に設定。'),
      'alt': t('Dynamic alt. Set alternative text dynamically.', '動的alt。代替テキストを動的に設定。'),
      'value': t('Dynamic value. One-way value binding (does not watch input unlike :bind).', '動的value。一方向の値バインド（:bindとは異なり入力を監視しない）。'),
      'placeholder': t('Dynamic placeholder.', '動的placeholder。'),
    };
    const desc = bindDocs[attr] || t(`Dynamic attribute binding. Result of expression becomes the value of \`${attr}\` attribute.`, `動的属性バインディング。式の結果が \`${attr}\` 属性の値になります。`);
    return mkHover(`**:${attr}** — ${desc}\n\n\`\`\`chasket\n<div :${attr}="expression">\n\`\`\``, wordRange);
  }

  // ── キーワード特別処理 ──
  // fn, async, type は複合キーワードのためここで個別処理
  if (word === 'fn') return mkHover(getHover()['fn'], wordRange);
  if (word === 'async') return mkHover(getHover()['async'], wordRange);
  if (word === 'type') return mkHover(getHover()['type'], wordRange);

  // ── FEATURE 2: Import hover info ──
  // Show where a symbol was imported from
  let uri = document.uri.toString();
  let syms = documentSymbols.get(uri);
  if (syms && syms.has(word)) {
    const sym = syms.get(word);
    if (sym.source === 'import') {
      let md = '';
      const kindLabel = sym.importKind === 'default' ? t('default import', 'デフォルトインポート')
        : sym.importKind === 'named' ? t('named import', '名前付きインポート')
        : t('namespace import', '名前空間インポート');

      md += `**${word}** — ${t('imported from', 'インポート元')}: \`${sym.importPath}\`\n\n`;
      md += `(${kindLabel})\n`;

      return mkHover(md, wordRange);
    }
  }

  // ── FEATURE 2b: Hover for methods on imported objects ──
  // e.g. ReactiveNode.createReacterNode() — show origin + method signature from source
  if (syms) {
    const lineText = line;
    // Use word start position (not cursor position) to check what's before the word
    const wordStart = wordRange.start.character;
    // Check if word is preceded by "importedName." pattern
    const dotAccess = lineText.substring(0, wordStart).match(/(\w+)\.\s*$/);
    if (dotAccess) {
      const objName = dotAccess[1];
      const sym = syms.get(objName);
      if (sym && sym.source === 'import' && sym.importPath) {
        // Resolve source file and find method definition
        const hoverInfo = resolveImportMember(document, sym, word);
        if (hoverInfo) {
          return mkHover(hoverInfo, wordRange);
        }
        // Fallback: show basic info even if we can't find the method definition
        let md = `**${objName}.${word}**\n\n`;
        md += `${t('Method/property of', 'メソッド/プロパティ（元:')}\` ${sym.importPath}\`${isJa() ? '）' : ''}\n`;
        return mkHover(md, wordRange);
      }
    }
  }

  // ── ユーザー定義シンボルの検索 ──
  // documentSymbols から識別子を検索し、型情報とJSDocを表示
  uri = document.uri.toString();
  syms = documentSymbols.get(uri);
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
      md += t(`Compiles to: \`#${word}()\` private method`, `コンパイル: \`#${word}()\` private メソッド`) + '\n\n';
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
        md += t('*Function expression* — ', '*関数式* — ') + t(`can be used as event handler with \`@click="${word}"\``, `\`@click="${word}"\` でイベントハンドラとして使用可能`) + '\n\n';
      }
    } else if (sym.source === 'prop') {
      const initStr = sym.init ? ` = ${sym.init}` : '';
      md += `\`\`\`chasket\nprop ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
      // コールバック prop の場合
      if (sym.type.toLowerCase().includes('function') || sym.type.includes('=>')) {
        md += t('*Callback* — ', '*コールバック* — ') + t(`function passed from parent. Use with \`@click="${word}"\``, `親から渡された関数。\`@click="${word}"\` で使用可能`) + '\n\n';
      }
    } else if (sym.source === 'const' || sym.source === 'let') {
      const initDisplay = sym.init ? (sym.init.length > 50 ? sym.init.substring(0, 47) + '...' : sym.init) : '';
      const initStr = initDisplay ? ` = ${initDisplay}` : '';
      md += `\`\`\`chasket\n${kind} ${word}: ${sym.type}${initStr}\n\`\`\`\n\n`;
      md += t('*Non-reactive* — ', '*非リアクティブ* — ') + t('value changes are not reflected in DOM', '値の変更はDOMに反映されません') + '。\n\n';
      if (sym.init && (sym.init.includes('=>') || sym.init.includes('function'))) {
        md += t('*Function expression* — ', '*関数式* — ') + t(`can be used as event handler with \`@click="${word}"\``, `\`@click="${word}"\` でイベントハンドラとして使用可能`) + '\n\n';
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
// JavaScript 組み込みAPI ドット補完辞書
// ═══════════════════════════════════════════
/**
 * JavaScript 組み込みオブジェクトのメンバー辞書
 * `window.`, `document.`, `console.`, `Math.` 等のドット補完に使用
 * @type {Object<string, Array<{name: string, kind: vscode.CompletionItemKind, detail: string, doc?: string}>>}
 */
const JS_BUILTINS = {
  'console': [
    { name: 'log', kind: vscode.CompletionItemKind.Method, detail: 'console.log(...args): void', doc: t('Output a message to the console', 'コンソールにメッセージを出力') },
    { name: 'error', kind: vscode.CompletionItemKind.Method, detail: 'console.error(...args): void', doc: t('Output an error message', 'エラーメッセージを出力') },
    { name: 'warn', kind: vscode.CompletionItemKind.Method, detail: 'console.warn(...args): void', doc: t('Output a warning message', '警告メッセージを出力') },
    { name: 'info', kind: vscode.CompletionItemKind.Method, detail: 'console.info(...args): void', doc: t('Output an informational message', '情報メッセージを出力') },
    { name: 'debug', kind: vscode.CompletionItemKind.Method, detail: 'console.debug(...args): void', doc: t('Output a debug message', 'デバッグメッセージを出力') },
    { name: 'table', kind: vscode.CompletionItemKind.Method, detail: 'console.table(data, columns?): void', doc: t('Display tabular data', '表形式でデータを表示') },
    { name: 'dir', kind: vscode.CompletionItemKind.Method, detail: 'console.dir(obj): void', doc: t('Display object properties', 'オブジェクトのプロパティを表示') },
    { name: 'time', kind: vscode.CompletionItemKind.Method, detail: 'console.time(label): void', doc: t('Start a timer', 'タイマーを開始') },
    { name: 'timeEnd', kind: vscode.CompletionItemKind.Method, detail: 'console.timeEnd(label): void', doc: t('Stop a timer and output elapsed time', 'タイマーを停止して経過時間を出力') },
    { name: 'group', kind: vscode.CompletionItemKind.Method, detail: 'console.group(label?): void', doc: t('Start a group', 'グループを開始') },
    { name: 'groupEnd', kind: vscode.CompletionItemKind.Method, detail: 'console.groupEnd(): void', doc: t('End a group', 'グループを終了') },
    { name: 'clear', kind: vscode.CompletionItemKind.Method, detail: 'console.clear(): void', doc: t('Clear the console', 'コンソールをクリア') },
    { name: 'assert', kind: vscode.CompletionItemKind.Method, detail: 'console.assert(condition, ...args): void', doc: t('Assert a condition', '条件をアサート') },
    { name: 'count', kind: vscode.CompletionItemKind.Method, detail: 'console.count(label?): void', doc: t('Count the number of times called', '呼び出し回数をカウント') },
    { name: 'trace', kind: vscode.CompletionItemKind.Method, detail: 'console.trace(...args): void', doc: t('Output a stack trace', 'スタックトレースを出力') },
  ],
  'Math': [
    { name: 'abs', kind: vscode.CompletionItemKind.Method, detail: 'Math.abs(x): number', doc: t('Returns absolute value', '絶対値を返す') },
    { name: 'ceil', kind: vscode.CompletionItemKind.Method, detail: 'Math.ceil(x): number', doc: t('Round up', '切り上げ') },
    { name: 'floor', kind: vscode.CompletionItemKind.Method, detail: 'Math.floor(x): number', doc: t('Round down', '切り捨て') },
    { name: 'round', kind: vscode.CompletionItemKind.Method, detail: 'Math.round(x): number', doc: t('Round to nearest integer', '四捨五入') },
    { name: 'max', kind: vscode.CompletionItemKind.Method, detail: 'Math.max(...values): number', doc: t('Returns the largest', '最大値を返す') },
    { name: 'min', kind: vscode.CompletionItemKind.Method, detail: 'Math.min(...values): number', doc: t('Returns the smallest', '最小値を返す') },
    { name: 'random', kind: vscode.CompletionItemKind.Method, detail: 'Math.random(): number', doc: t('Returns a random number [0, 1)', '0以上1未満のランダムな数を返す') },
    { name: 'pow', kind: vscode.CompletionItemKind.Method, detail: 'Math.pow(base, exp): number', doc: t('Returns base to the power of exp', 'べき乗を返す') },
    { name: 'sqrt', kind: vscode.CompletionItemKind.Method, detail: 'Math.sqrt(x): number', doc: t('Returns square root', '平方根を返す') },
    { name: 'sign', kind: vscode.CompletionItemKind.Method, detail: 'Math.sign(x): number', doc: t('Returns sign of a number', '数の符号を返す') },
    { name: 'trunc', kind: vscode.CompletionItemKind.Method, detail: 'Math.trunc(x): number', doc: t('Truncate decimal part', '小数部を切り捨て') },
    { name: 'log', kind: vscode.CompletionItemKind.Method, detail: 'Math.log(x): number', doc: t('Returns natural logarithm', '自然対数を返す') },
    { name: 'log2', kind: vscode.CompletionItemKind.Method, detail: 'Math.log2(x): number', doc: t('Returns base-2 logarithm', '底2の対数を返す') },
    { name: 'log10', kind: vscode.CompletionItemKind.Method, detail: 'Math.log10(x): number', doc: t('Returns base-10 logarithm', '底10の対数を返す') },
    { name: 'sin', kind: vscode.CompletionItemKind.Method, detail: 'Math.sin(x): number' },
    { name: 'cos', kind: vscode.CompletionItemKind.Method, detail: 'Math.cos(x): number' },
    { name: 'tan', kind: vscode.CompletionItemKind.Method, detail: 'Math.tan(x): number' },
    { name: 'PI', kind: vscode.CompletionItemKind.Constant, detail: 'Math.PI: 3.141592653589793' },
    { name: 'E', kind: vscode.CompletionItemKind.Constant, detail: 'Math.E: 2.718281828459045' },
    { name: 'SQRT2', kind: vscode.CompletionItemKind.Constant, detail: 'Math.SQRT2: 1.4142135623730951' },
    { name: 'LN2', kind: vscode.CompletionItemKind.Constant, detail: 'Math.LN2: 0.6931471805599453' },
    { name: 'LN10', kind: vscode.CompletionItemKind.Constant, detail: 'Math.LN10: 2.302585092994046' },
    { name: 'hypot', kind: vscode.CompletionItemKind.Method, detail: 'Math.hypot(...values): number', doc: t('Returns square root of sum of squares', '引数の二乗の合計の平方根を返す') },
    { name: 'clz32', kind: vscode.CompletionItemKind.Method, detail: 'Math.clz32(x): number' },
  ],
  'JSON': [
    { name: 'stringify', kind: vscode.CompletionItemKind.Method, detail: 'JSON.stringify(value, replacer?, space?): string', doc: t('Convert value to JSON string', '値をJSON文字列に変換') },
    { name: 'parse', kind: vscode.CompletionItemKind.Method, detail: 'JSON.parse(text, reviver?): any', doc: t('Parse JSON string to value', 'JSON文字列を値にパース') },
  ],
  'Object': [
    { name: 'keys', kind: vscode.CompletionItemKind.Method, detail: 'Object.keys(obj): string[]', doc: t('Returns array of property names', 'プロパティ名の配列を返す') },
    { name: 'values', kind: vscode.CompletionItemKind.Method, detail: 'Object.values(obj): any[]', doc: t('Returns array of property values', 'プロパティ値の配列を返す') },
    { name: 'entries', kind: vscode.CompletionItemKind.Method, detail: 'Object.entries(obj): [string, any][]', doc: t('Returns array of [key, value] pairs', '[key, value]ペアの配列を返す') },
    { name: 'assign', kind: vscode.CompletionItemKind.Method, detail: 'Object.assign(target, ...sources): object', doc: t('Copy properties to target', 'プロパティをターゲットにコピー') },
    { name: 'freeze', kind: vscode.CompletionItemKind.Method, detail: 'Object.freeze(obj): object', doc: t('Freeze an object', 'オブジェクトを凍結') },
    { name: 'create', kind: vscode.CompletionItemKind.Method, detail: 'Object.create(proto, props?): object', doc: t('Create object with specified prototype', '指定プロトタイプでオブジェクトを作成') },
    { name: 'defineProperty', kind: vscode.CompletionItemKind.Method, detail: 'Object.defineProperty(obj, prop, descriptor): object' },
    { name: 'getPrototypeOf', kind: vscode.CompletionItemKind.Method, detail: 'Object.getPrototypeOf(obj): object | null' },
    { name: 'hasOwn', kind: vscode.CompletionItemKind.Method, detail: 'Object.hasOwn(obj, prop): boolean' },
    { name: 'fromEntries', kind: vscode.CompletionItemKind.Method, detail: 'Object.fromEntries(iterable): object', doc: t('Create object from entries', 'エントリからオブジェクトを作成') },
  ],
  'Array': [
    { name: 'isArray', kind: vscode.CompletionItemKind.Method, detail: 'Array.isArray(value): boolean', doc: t('Check if value is an array', '値が配列かどうかを判定') },
    { name: 'from', kind: vscode.CompletionItemKind.Method, detail: 'Array.from(iterable, mapFn?): any[]', doc: t('Create array from iterable', '反復可能オブジェクトから配列を作成') },
    { name: 'of', kind: vscode.CompletionItemKind.Method, detail: 'Array.of(...items): any[]', doc: t('Create array from arguments', '引数から配列を作成') },
  ],
  'Promise': [
    { name: 'all', kind: vscode.CompletionItemKind.Method, detail: 'Promise.all(iterable): Promise', doc: t('Wait for all promises', '全てのPromiseを待つ') },
    { name: 'allSettled', kind: vscode.CompletionItemKind.Method, detail: 'Promise.allSettled(iterable): Promise', doc: t('Wait for all promises to settle', '全てのPromiseの完了を待つ') },
    { name: 'race', kind: vscode.CompletionItemKind.Method, detail: 'Promise.race(iterable): Promise', doc: t('Wait for first promise', '最初のPromiseを待つ') },
    { name: 'any', kind: vscode.CompletionItemKind.Method, detail: 'Promise.any(iterable): Promise', doc: t('Wait for first fulfilled promise', '最初に成功するPromiseを待つ') },
    { name: 'resolve', kind: vscode.CompletionItemKind.Method, detail: 'Promise.resolve(value): Promise', doc: t('Create resolved promise', '解決済みPromiseを作成') },
    { name: 'reject', kind: vscode.CompletionItemKind.Method, detail: 'Promise.reject(reason): Promise', doc: t('Create rejected promise', '拒否済みPromiseを作成') },
  ],
  'Number': [
    { name: 'isFinite', kind: vscode.CompletionItemKind.Method, detail: 'Number.isFinite(value): boolean' },
    { name: 'isInteger', kind: vscode.CompletionItemKind.Method, detail: 'Number.isInteger(value): boolean' },
    { name: 'isNaN', kind: vscode.CompletionItemKind.Method, detail: 'Number.isNaN(value): boolean' },
    { name: 'parseFloat', kind: vscode.CompletionItemKind.Method, detail: 'Number.parseFloat(string): number' },
    { name: 'parseInt', kind: vscode.CompletionItemKind.Method, detail: 'Number.parseInt(string, radix?): number' },
    { name: 'MAX_SAFE_INTEGER', kind: vscode.CompletionItemKind.Constant, detail: 'Number.MAX_SAFE_INTEGER: 9007199254740991' },
    { name: 'MIN_SAFE_INTEGER', kind: vscode.CompletionItemKind.Constant, detail: 'Number.MIN_SAFE_INTEGER: -9007199254740991' },
  ],
  'document': [
    { name: 'getElementById', kind: vscode.CompletionItemKind.Method, detail: 'document.getElementById(id): Element | null', doc: t('Get element by ID', 'IDで要素を取得') },
    { name: 'querySelector', kind: vscode.CompletionItemKind.Method, detail: 'document.querySelector(selectors): Element | null', doc: t('Get first matching element', '最初にマッチする要素を取得') },
    { name: 'querySelectorAll', kind: vscode.CompletionItemKind.Method, detail: 'document.querySelectorAll(selectors): NodeList', doc: t('Get all matching elements', 'マッチする全要素を取得') },
    { name: 'createElement', kind: vscode.CompletionItemKind.Method, detail: 'document.createElement(tagName): Element', doc: t('Create a new element', '新しい要素を作成') },
    { name: 'createTextNode', kind: vscode.CompletionItemKind.Method, detail: 'document.createTextNode(text): Text' },
    { name: 'createDocumentFragment', kind: vscode.CompletionItemKind.Method, detail: 'document.createDocumentFragment(): DocumentFragment' },
    { name: 'addEventListener', kind: vscode.CompletionItemKind.Method, detail: 'document.addEventListener(type, listener, options?): void' },
    { name: 'removeEventListener', kind: vscode.CompletionItemKind.Method, detail: 'document.removeEventListener(type, listener, options?): void' },
    { name: 'body', kind: vscode.CompletionItemKind.Property, detail: 'document.body: HTMLBodyElement' },
    { name: 'head', kind: vscode.CompletionItemKind.Property, detail: 'document.head: HTMLHeadElement' },
    { name: 'title', kind: vscode.CompletionItemKind.Property, detail: 'document.title: string' },
    { name: 'documentElement', kind: vscode.CompletionItemKind.Property, detail: 'document.documentElement: HTMLHtmlElement' },
    { name: 'cookie', kind: vscode.CompletionItemKind.Property, detail: 'document.cookie: string' },
    { name: 'location', kind: vscode.CompletionItemKind.Property, detail: 'document.location: Location' },
    { name: 'readyState', kind: vscode.CompletionItemKind.Property, detail: 'document.readyState: string' },
    { name: 'activeElement', kind: vscode.CompletionItemKind.Property, detail: 'document.activeElement: Element | null' },
  ],
  'window': [
    { name: 'addEventListener', kind: vscode.CompletionItemKind.Method, detail: 'window.addEventListener(type, listener, options?): void' },
    { name: 'removeEventListener', kind: vscode.CompletionItemKind.Method, detail: 'window.removeEventListener(type, listener, options?): void' },
    { name: 'setTimeout', kind: vscode.CompletionItemKind.Method, detail: 'window.setTimeout(callback, ms?): number', doc: t('Execute callback after delay', '遅延後にコールバックを実行') },
    { name: 'setInterval', kind: vscode.CompletionItemKind.Method, detail: 'window.setInterval(callback, ms?): number', doc: t('Execute callback at intervals', '一定間隔でコールバックを実行') },
    { name: 'clearTimeout', kind: vscode.CompletionItemKind.Method, detail: 'window.clearTimeout(id): void' },
    { name: 'clearInterval', kind: vscode.CompletionItemKind.Method, detail: 'window.clearInterval(id): void' },
    { name: 'requestAnimationFrame', kind: vscode.CompletionItemKind.Method, detail: 'window.requestAnimationFrame(callback): number', doc: t('Request animation frame', 'アニメーションフレームをリクエスト') },
    { name: 'cancelAnimationFrame', kind: vscode.CompletionItemKind.Method, detail: 'window.cancelAnimationFrame(id): void' },
    { name: 'fetch', kind: vscode.CompletionItemKind.Method, detail: 'window.fetch(input, init?): Promise<Response>', doc: t('Fetch a resource', 'リソースを取得') },
    { name: 'alert', kind: vscode.CompletionItemKind.Method, detail: 'window.alert(message?): void' },
    { name: 'confirm', kind: vscode.CompletionItemKind.Method, detail: 'window.confirm(message?): boolean' },
    { name: 'prompt', kind: vscode.CompletionItemKind.Method, detail: 'window.prompt(message?, default?): string | null' },
    { name: 'open', kind: vscode.CompletionItemKind.Method, detail: 'window.open(url?, target?, features?): Window | null' },
    { name: 'close', kind: vscode.CompletionItemKind.Method, detail: 'window.close(): void' },
    { name: 'scroll', kind: vscode.CompletionItemKind.Method, detail: 'window.scroll(x, y): void' },
    { name: 'scrollTo', kind: vscode.CompletionItemKind.Method, detail: 'window.scrollTo(x, y): void' },
    { name: 'scrollBy', kind: vscode.CompletionItemKind.Method, detail: 'window.scrollBy(x, y): void' },
    { name: 'getComputedStyle', kind: vscode.CompletionItemKind.Method, detail: 'window.getComputedStyle(element, pseudo?): CSSStyleDeclaration' },
    { name: 'matchMedia', kind: vscode.CompletionItemKind.Method, detail: 'window.matchMedia(query): MediaQueryList' },
    { name: 'location', kind: vscode.CompletionItemKind.Property, detail: 'window.location: Location' },
    { name: 'history', kind: vscode.CompletionItemKind.Property, detail: 'window.history: History' },
    { name: 'navigator', kind: vscode.CompletionItemKind.Property, detail: 'window.navigator: Navigator' },
    { name: 'localStorage', kind: vscode.CompletionItemKind.Property, detail: 'window.localStorage: Storage' },
    { name: 'sessionStorage', kind: vscode.CompletionItemKind.Property, detail: 'window.sessionStorage: Storage' },
    { name: 'innerWidth', kind: vscode.CompletionItemKind.Property, detail: 'window.innerWidth: number' },
    { name: 'innerHeight', kind: vscode.CompletionItemKind.Property, detail: 'window.innerHeight: number' },
    { name: 'outerWidth', kind: vscode.CompletionItemKind.Property, detail: 'window.outerWidth: number' },
    { name: 'outerHeight', kind: vscode.CompletionItemKind.Property, detail: 'window.outerHeight: number' },
    { name: 'scrollX', kind: vscode.CompletionItemKind.Property, detail: 'window.scrollX: number' },
    { name: 'scrollY', kind: vscode.CompletionItemKind.Property, detail: 'window.scrollY: number' },
    { name: 'devicePixelRatio', kind: vscode.CompletionItemKind.Property, detail: 'window.devicePixelRatio: number' },
    { name: 'performance', kind: vscode.CompletionItemKind.Property, detail: 'window.performance: Performance' },
    { name: 'customElements', kind: vscode.CompletionItemKind.Property, detail: 'window.customElements: CustomElementRegistry' },
  ],
  'this': [
    { name: 'shadowRoot', kind: vscode.CompletionItemKind.Property, detail: 'this.shadowRoot: ShadowRoot | null', doc: t('Shadow DOM root of this component', 'このコンポーネントのShadow DOMルート') },
    { name: 'getAttribute', kind: vscode.CompletionItemKind.Method, detail: 'this.getAttribute(name): string | null', doc: t('Get attribute value', '属性値を取得') },
    { name: 'setAttribute', kind: vscode.CompletionItemKind.Method, detail: 'this.setAttribute(name, value): void', doc: t('Set attribute value', '属性値を設定') },
    { name: 'removeAttribute', kind: vscode.CompletionItemKind.Method, detail: 'this.removeAttribute(name): void' },
    { name: 'hasAttribute', kind: vscode.CompletionItemKind.Method, detail: 'this.hasAttribute(name): boolean' },
    { name: 'toggleAttribute', kind: vscode.CompletionItemKind.Method, detail: 'this.toggleAttribute(name, force?): boolean' },
    { name: 'dispatchEvent', kind: vscode.CompletionItemKind.Method, detail: 'this.dispatchEvent(event): boolean', doc: t('Dispatch an event', 'イベントをディスパッチ') },
    { name: 'addEventListener', kind: vscode.CompletionItemKind.Method, detail: 'this.addEventListener(type, listener, options?): void' },
    { name: 'removeEventListener', kind: vscode.CompletionItemKind.Method, detail: 'this.removeEventListener(type, listener, options?): void' },
    { name: 'closest', kind: vscode.CompletionItemKind.Method, detail: 'this.closest(selectors): Element | null' },
    { name: 'querySelector', kind: vscode.CompletionItemKind.Method, detail: 'this.querySelector(selectors): Element | null' },
    { name: 'querySelectorAll', kind: vscode.CompletionItemKind.Method, detail: 'this.querySelectorAll(selectors): NodeList' },
    { name: 'classList', kind: vscode.CompletionItemKind.Property, detail: 'this.classList: DOMTokenList' },
    { name: 'style', kind: vscode.CompletionItemKind.Property, detail: 'this.style: CSSStyleDeclaration' },
    { name: 'dataset', kind: vscode.CompletionItemKind.Property, detail: 'this.dataset: DOMStringMap' },
    { name: 'id', kind: vscode.CompletionItemKind.Property, detail: 'this.id: string' },
    { name: 'className', kind: vscode.CompletionItemKind.Property, detail: 'this.className: string' },
    { name: 'tagName', kind: vscode.CompletionItemKind.Property, detail: 'this.tagName: string' },
    { name: 'innerHTML', kind: vscode.CompletionItemKind.Property, detail: 'this.innerHTML: string' },
    { name: 'textContent', kind: vscode.CompletionItemKind.Property, detail: 'this.textContent: string | null' },
    { name: 'children', kind: vscode.CompletionItemKind.Property, detail: 'this.children: HTMLCollection' },
    { name: 'parentElement', kind: vscode.CompletionItemKind.Property, detail: 'this.parentElement: Element | null' },
    { name: 'isConnected', kind: vscode.CompletionItemKind.Property, detail: 'this.isConnected: boolean' },
  ],
};

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
  'state': { kind: vscode.CompletionItemKind.Keyword, detail: t('Reactive variable', 'リアクティブ変数'), insertText: 'state ${1:name}: ${2:type} = ${3:value}' },
  'const': { kind: vscode.CompletionItemKind.Keyword, detail: t('Non-reactive constant', '非リアクティブ定数'), insertText: 'const ${1:NAME} = ${2:value}' },
  'let': { kind: vscode.CompletionItemKind.Keyword, detail: t('Non-reactive variable', '非リアクティブ変数'), insertText: 'let ${1:name} = ${2:value}' },
  'prop': { kind: vscode.CompletionItemKind.Keyword, detail: t('External attribute', '外部属性'), insertText: 'prop ${1:name}: ${2:type}' },
  'computed': { kind: vscode.CompletionItemKind.Keyword, detail: t('Derived value', '派生値'), insertText: 'computed ${1:name}: ${2:type} = ${3:expr}' },
  'emit': { kind: vscode.CompletionItemKind.Keyword, detail: t('Custom event', 'カスタムイベント'), insertText: 'emit ${1:name}: ${2:type}' },
  'ref': { kind: vscode.CompletionItemKind.Keyword, detail: t('DOM reference', 'DOM参照'), insertText: 'ref ${1:name}: ${2:type}' },
  'fn': { kind: vscode.CompletionItemKind.Keyword, detail: t('Function definition', '関数定義'), insertText: 'fn ${1:name}(${2:params}) {\n  ${3:}\n}' },
  'on mount': { kind: vscode.CompletionItemKind.Keyword, detail: t('On mount', 'マウント時の処理'), insertText: 'on mount {\n  ${1:}\n}' },
  'on unmount': { kind: vscode.CompletionItemKind.Keyword, detail: t('On unmount', 'アンマウント時の処理'), insertText: 'on unmount {\n  ${1:}\n}' },
  'on adopt': { kind: vscode.CompletionItemKind.Keyword, detail: t('On slot adoption', 'スロット採用時の処理'), insertText: 'on adopt {\n  ${1:}\n}' },
  'on formReset': { kind: vscode.CompletionItemKind.Keyword, detail: t('On form reset', 'フォームリセット時'), insertText: 'on formReset {\n  ${1:}\n}' },
  'on formAssociated': { kind: vscode.CompletionItemKind.Keyword, detail: t('On form associated', 'フォーム関連付け時'), insertText: 'on formAssociated {\n  ${1:}\n}' },
  'on formDisabled': { kind: vscode.CompletionItemKind.Keyword, detail: t('On form disabled', 'フォーム無効化時'), insertText: 'on formDisabled {\n  ${1:}\n}' },
  'on update': { kind: vscode.CompletionItemKind.Keyword, detail: t('On property update', '属性変更時'), insertText: 'on update(${1:propName}) {\n  ${2:}\n}' },
  'on error': { kind: vscode.CompletionItemKind.Keyword, detail: t('Error handling', 'エラーハンドリング'), insertText: 'on error(${1:err}) {\n  ${2:}\n}' },
  'on formStateRestore': { kind: vscode.CompletionItemKind.Keyword, detail: t('On form state restore', 'フォーム復元時'), insertText: 'on formStateRestore {\n  ${1:}\n}' },
  'setFormValue': { kind: vscode.CompletionItemKind.Function, detail: t('Set form value', 'フォーム値設定'), insertText: 'setFormValue(${1:value})' },
  'setValidity': { kind: vscode.CompletionItemKind.Function, detail: t('Set validation state', 'バリデーション設定'), insertText: 'setValidity(${1:flags}, ${2:message})' },
  'watch': { kind: vscode.CompletionItemKind.Keyword, detail: t('Side effect', '副作用'), insertText: 'watch(${1:dependency}) {\n  ${2:}\n}' },
  'provide': { kind: vscode.CompletionItemKind.Keyword, detail: t('Provide context', 'コンテキスト提供'), insertText: 'provide ${1:name}: ${2:type} = ${3:value}' },
  'consume': { kind: vscode.CompletionItemKind.Keyword, detail: t('Consume context', 'コンテキスト受信'), insertText: 'consume ${1:name}: ${2:type}' },
  'import': { kind: vscode.CompletionItemKind.Keyword, detail: t('Import', 'インポート'), insertText: 'import ${1:name} from "${2:path}"' },
  'type': { kind: vscode.CompletionItemKind.Keyword, detail: t('Type alias', '型エイリアス'), insertText: 'type ${1:Name} = ${2:type}' },
  'generic': { kind: vscode.CompletionItemKind.Keyword, detail: t('Generic type parameter (in meta)', 'ジェネリック型パラメータ（meta内）'), insertText: 'generic: ${1:T}' },

  // Template directives
  '#if': { kind: vscode.CompletionItemKind.Keyword, detail: t('Conditional branch', '条件分岐'), insertText: '<#if cond="${1:condition}">\n  ${2:}\n</#if>' },
  '#for': { kind: vscode.CompletionItemKind.Keyword, detail: t('Loop', 'ループ'), insertText: '<#for each="${1:item}" of="${2:items}" key="${3:item.id}">\n  ${4:}\n</#for>' },
  ':else': { kind: vscode.CompletionItemKind.Keyword, detail: t('Else branch', 'else分岐'), insertText: '<:else>' },
  ':else-if': { kind: vscode.CompletionItemKind.Keyword, detail: t('Else-if branch', 'else-if分岐'), insertText: '<:else-if cond="${1:condition}">' },
  ':empty': { kind: vscode.CompletionItemKind.Keyword, detail: t('Empty state display', '空時の表示'), insertText: '<:empty>\n  ${1:}\n</:empty>' },
  '{{ }}': { kind: vscode.CompletionItemKind.Snippet, detail: t('Template expression', 'テンプレート式'), insertText: '{{ ${1:expr} }}' },
  '@html': { kind: vscode.CompletionItemKind.Keyword, detail: t('Raw HTML injection (XSS risk)', '生HTML注入（XSS注意）'), insertText: '@html="${1:content}"' },

  // File scaffold snippet (like HTML's ! shortcut)
  'chasket': { kind: vscode.CompletionItemKind.Snippet, detail: t('Chasket component scaffold', 'Chasket コンポーネント雛形'), insertText: '<meta>\n  name: "${1:x-my-component}"\n  shadow: ${2|open,closed,none|}\n</meta>\n\n<script>\n  ${3:state count: number = 0}\n</script>\n\n<template>\n  ${4:<p>Hello, Chasket!</p>}\n</template>\n\n<style>\n  ${5::host \\{ display: block; \\}}\n</style>' },
  'chasket-minimal': { kind: vscode.CompletionItemKind.Snippet, detail: t('Minimal Chasket component', '最小 Chasket コンポーネント'), insertText: '<meta>\n  name: "${1:x-my-component}"\n</meta>\n\n<template>\n  ${2:<p>Hello!</p>}\n</template>' },

  // Event handlers — Mouse
  '@click': { kind: vscode.CompletionItemKind.Method, detail: t('Click event', 'クリックイベント'), insertText: '@click="${1:handler}"' },
  '@dblclick': { kind: vscode.CompletionItemKind.Method, detail: t('Double-click', 'ダブルクリック'), insertText: '@dblclick="${1:handler}"' },
  '@mousedown': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse button down', 'マウスボタン押下'), insertText: '@mousedown="${1:handler}"' },
  '@mouseup': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse button up', 'マウスボタン解放'), insertText: '@mouseup="${1:handler}"' },
  '@mousemove': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse move', 'マウス移動'), insertText: '@mousemove="${1:handler}"' },
  '@mouseenter': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse enter (no bubble)', 'マウス進入（バブルなし）'), insertText: '@mouseenter="${1:handler}"' },
  '@mouseleave': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse leave (no bubble)', 'マウス離脱（バブルなし）'), insertText: '@mouseleave="${1:handler}"' },
  '@mouseover': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse over', 'マウス重なり'), insertText: '@mouseover="${1:handler}"' },
  '@mouseout': { kind: vscode.CompletionItemKind.Method, detail: t('Mouse out', 'マウス離れ'), insertText: '@mouseout="${1:handler}"' },
  '@contextmenu': { kind: vscode.CompletionItemKind.Method, detail: t('Right-click context menu', '右クリックメニュー'), insertText: '@contextmenu|prevent="${1:handler}"' },

  // Event handlers — Keyboard
  '@keydown': { kind: vscode.CompletionItemKind.Method, detail: t('Key down', 'キー押下'), insertText: '@keydown="${1:handler}"' },
  '@keyup': { kind: vscode.CompletionItemKind.Method, detail: t('Key up', 'キー解放'), insertText: '@keyup="${1:handler}"' },
  '@keypress': { kind: vscode.CompletionItemKind.Method, detail: t('Key press (deprecated)', 'キー入力（非推奨）'), insertText: '@keypress="${1:handler}"' },

  // Event handlers — Form / Input
  '@input': { kind: vscode.CompletionItemKind.Method, detail: t('Input value change', '入力値変更'), insertText: '@input="${1:handler}"' },
  '@change': { kind: vscode.CompletionItemKind.Method, detail: t('Value confirmed', '値確定'), insertText: '@change="${1:handler}"' },
  '@submit': { kind: vscode.CompletionItemKind.Method, detail: t('Form submit', 'フォーム送信'), insertText: '@submit|prevent="${1:handler}"' },
  '@reset': { kind: vscode.CompletionItemKind.Method, detail: t('Form reset', 'フォームリセット'), insertText: '@reset="${1:handler}"' },
  '@invalid': { kind: vscode.CompletionItemKind.Method, detail: t('Validation failed', 'バリデーション失敗'), insertText: '@invalid="${1:handler}"' },
  '@select': { kind: vscode.CompletionItemKind.Method, detail: t('Text selection', 'テキスト選択'), insertText: '@select="${1:handler}"' },

  // Event handlers — Focus
  '@focus': { kind: vscode.CompletionItemKind.Method, detail: t('Focus gained', 'フォーカス取得'), insertText: '@focus="${1:handler}"' },
  '@blur': { kind: vscode.CompletionItemKind.Method, detail: t('Focus lost', 'フォーカス喪失'), insertText: '@blur="${1:handler}"' },
  '@focusin': { kind: vscode.CompletionItemKind.Method, detail: t('Focus in (with bubble)', 'フォーカス取得（バブルあり）'), insertText: '@focusin="${1:handler}"' },
  '@focusout': { kind: vscode.CompletionItemKind.Method, detail: t('Focus out (with bubble)', 'フォーカス喪失（バブルあり）'), insertText: '@focusout="${1:handler}"' },

  // Event handlers — Pointer
  '@pointerdown': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer down', 'ポインター押下'), insertText: '@pointerdown="${1:handler}"' },
  '@pointerup': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer up', 'ポインター解放'), insertText: '@pointerup="${1:handler}"' },
  '@pointermove': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer move', 'ポインター移動'), insertText: '@pointermove="${1:handler}"' },
  '@pointerenter': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer enter', 'ポインター進入'), insertText: '@pointerenter="${1:handler}"' },
  '@pointerleave': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer leave', 'ポインター離脱'), insertText: '@pointerleave="${1:handler}"' },
  '@pointerover': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer over', 'ポインター重なり'), insertText: '@pointerover="${1:handler}"' },
  '@pointerout': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer out', 'ポインター離れ'), insertText: '@pointerout="${1:handler}"' },
  '@pointercancel': { kind: vscode.CompletionItemKind.Method, detail: t('Pointer cancel', 'ポインターキャンセル'), insertText: '@pointercancel="${1:handler}"' },

  // Event handlers — Touch
  '@touchstart': { kind: vscode.CompletionItemKind.Method, detail: t('Touch start', 'タッチ開始'), insertText: '@touchstart="${1:handler}"' },
  '@touchend': { kind: vscode.CompletionItemKind.Method, detail: t('Touch end', 'タッチ終了'), insertText: '@touchend="${1:handler}"' },
  '@touchmove': { kind: vscode.CompletionItemKind.Method, detail: t('Touch move', 'タッチ移動'), insertText: '@touchmove="${1:handler}"' },
  '@touchcancel': { kind: vscode.CompletionItemKind.Method, detail: t('Touch cancel', 'タッチキャンセル'), insertText: '@touchcancel="${1:handler}"' },

  // Event handlers — Drag & Drop
  '@dragstart': { kind: vscode.CompletionItemKind.Method, detail: t('Drag start', 'ドラッグ開始'), insertText: '@dragstart="${1:handler}"' },
  '@drag': { kind: vscode.CompletionItemKind.Method, detail: t('Dragging', 'ドラッグ中'), insertText: '@drag="${1:handler}"' },
  '@dragend': { kind: vscode.CompletionItemKind.Method, detail: t('Drag end', 'ドラッグ終了'), insertText: '@dragend="${1:handler}"' },
  '@dragenter': { kind: vscode.CompletionItemKind.Method, detail: t('Drag enter', 'ドラッグ進入'), insertText: '@dragenter="${1:handler}"' },
  '@dragleave': { kind: vscode.CompletionItemKind.Method, detail: t('Drag leave', 'ドラッグ離脱'), insertText: '@dragleave="${1:handler}"' },
  '@dragover': { kind: vscode.CompletionItemKind.Method, detail: t('Drag over', 'ドラッグオーバー'), insertText: '@dragover|prevent="${1:handler}"' },
  '@drop': { kind: vscode.CompletionItemKind.Method, detail: t('Drop', 'ドロップ'), insertText: '@drop|prevent="${1:handler}"' },

  // Event handlers — Scroll / Resize / Wheel
  '@scroll': { kind: vscode.CompletionItemKind.Method, detail: t('Scroll', 'スクロール'), insertText: '@scroll="${1:handler}"' },
  '@resize': { kind: vscode.CompletionItemKind.Method, detail: t('Resize', 'リサイズ'), insertText: '@resize="${1:handler}"' },
  '@wheel': { kind: vscode.CompletionItemKind.Method, detail: t('Wheel operation', 'ホイール操作'), insertText: '@wheel="${1:handler}"' },

  // Event handlers — Clipboard
  '@copy': { kind: vscode.CompletionItemKind.Method, detail: t('Copy', 'コピー'), insertText: '@copy="${1:handler}"' },
  '@cut': { kind: vscode.CompletionItemKind.Method, detail: t('Cut', 'カット'), insertText: '@cut="${1:handler}"' },
  '@paste': { kind: vscode.CompletionItemKind.Method, detail: t('Paste', 'ペースト'), insertText: '@paste="${1:handler}"' },

  // Event handlers — Composition (IME)
  '@compositionstart': { kind: vscode.CompletionItemKind.Method, detail: t('IME input start', 'IME入力開始'), insertText: '@compositionstart="${1:handler}"' },
  '@compositionupdate': { kind: vscode.CompletionItemKind.Method, detail: t('IME input update', 'IME入力中'), insertText: '@compositionupdate="${1:handler}"' },
  '@compositionend': { kind: vscode.CompletionItemKind.Method, detail: t('IME input end', 'IME入力確定'), insertText: '@compositionend="${1:handler}"' },

  // Event handlers — Animation / Transition
  '@animationstart': { kind: vscode.CompletionItemKind.Method, detail: t('Animation start', 'アニメーション開始'), insertText: '@animationstart="${1:handler}"' },
  '@animationend': { kind: vscode.CompletionItemKind.Method, detail: t('Animation end', 'アニメーション終了'), insertText: '@animationend="${1:handler}"' },
  '@animationiteration': { kind: vscode.CompletionItemKind.Method, detail: t('Animation iteration', 'アニメーション反復'), insertText: '@animationiteration="${1:handler}"' },
  '@transitionend': { kind: vscode.CompletionItemKind.Method, detail: t('Transition end', 'トランジション終了'), insertText: '@transitionend="${1:handler}"' },
  '@transitionstart': { kind: vscode.CompletionItemKind.Method, detail: t('Transition start', 'トランジション開始'), insertText: '@transitionstart="${1:handler}"' },
  '@transitionrun': { kind: vscode.CompletionItemKind.Method, detail: t('Transition run', 'トランジション実行'), insertText: '@transitionrun="${1:handler}"' },

  // Event handlers — Other
  '@load': { kind: vscode.CompletionItemKind.Method, detail: t('Load completed', '読み込み完了'), insertText: '@load="${1:handler}"' },
  '@error': { kind: vscode.CompletionItemKind.Method, detail: t('Error occurred', 'エラー発生'), insertText: '@error="${1:handler}"' },
  '@abort': { kind: vscode.CompletionItemKind.Method, detail: t('Load aborted', '読み込み中断'), insertText: '@abort="${1:handler}"' },
  '@toggle': { kind: vscode.CompletionItemKind.Method, detail: t('Toggle (details etc)', 'トグル（details等）'), insertText: '@toggle="${1:handler}"' },
  '@close': { kind: vscode.CompletionItemKind.Method, detail: t('Dialog closed', 'ダイアログ閉じ'), insertText: '@close="${1:handler}"' },
  '@cancel': { kind: vscode.CompletionItemKind.Method, detail: t('Dialog cancelled', 'ダイアログキャンセル'), insertText: '@cancel="${1:handler}"' },
  '@beforeinput': { kind: vscode.CompletionItemKind.Method, detail: t('Before input (cancellable)', '入力前（キャンセル可）'), insertText: '@beforeinput="${1:handler}"' },
  '@slotchange': { kind: vscode.CompletionItemKind.Method, detail: t('Slot changed', 'スロット変更'), insertText: '@slotchange="${1:handler}"' },

  // Dynamic attribute bindings
  ':class': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic class', '動的クラス'), insertText: ':class="${1:expression}"' },
  ':style': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic style', '動的スタイル'), insertText: ':style="${1:expression}"' },
  ':id': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic ID', '動的ID'), insertText: ':id="${1:expression}"' },
  ':src': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic src (with URL safety check)', '動的src（URL安全チェック付）'), insertText: ':src="${1:imageUrl}"' },
  ':href': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic href (with URL safety check)', '動的href（URL安全チェック付）'), insertText: ':href="${1:url}"' },
  ':alt': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic alt', '動的alt'), insertText: ':alt="${1:altText}"' },
  ':value': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic value', '動的value'), insertText: ':value="${1:expression}"' },
  ':placeholder': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic placeholder', '動的placeholder'), insertText: ':placeholder="${1:text}"' },
  ':disabled': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic disabled', '動的disabled'), insertText: ':disabled="${1:isDisabled}"' },
  ':hidden': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic hidden', '動的hidden'), insertText: ':hidden="${1:isHidden}"' },
  ':checked': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic checked', '動的checked'), insertText: ':checked="${1:isChecked}"' },
  ':for': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic for (for labels)', '動的for（label用）'), insertText: ':for="${1:inputId}"' },
  ':title': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic title', '動的title'), insertText: ':title="${1:tooltip}"' },
  ':name': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic name', '動的name'), insertText: ':name="${1:fieldName}"' },
  ':type': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic type', '動的type'), insertText: ':type="${1:inputType}"' },
  ':maxlength': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic maxlength', '動的maxlength'), insertText: ':maxlength="${1:max}"' },
  ':pattern': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic pattern', '動的pattern'), insertText: ':pattern="${1:regex}"' },
  ':required': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic required', '動的required'), insertText: ':required="${1:isRequired}"' },
  ':readonly': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic readonly', '動的readonly'), insertText: ':readonly="${1:isReadOnly}"' },
  ':aria-label': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic aria-label', '動的aria-label'), insertText: ':aria-label="${1:label}"' },
  ':data-': { kind: vscode.CompletionItemKind.Property, detail: t('Dynamic data attribute', '動的data属性'), insertText: ':data-${1:name}="${2:value}"' },

  // Two-way binding
  ':bind': { kind: vscode.CompletionItemKind.Method, detail: t('Two-way binding', '双方向バインディング'), insertText: ':bind="${1:stateName}"' },

  // Ref (template attribute)
  'ref=': { kind: vscode.CompletionItemKind.Method, detail: t('DOM reference (template attribute)', 'DOM参照（テンプレート属性）'), insertText: 'ref="${1:refName}"' },

  // Slot
  'slot': { kind: vscode.CompletionItemKind.Keyword, detail: t('Slot definition', 'スロット定義'), insertText: '<slot${1: name="${2:slotName}"}>${3}</slot>' },
};

/**
 * イベント修飾子の定義
 * @type {Object.<string, {detail: string, doc: string}>}
 */
const EVENT_MODIFIERS = {
  'prevent': { detail: 'preventDefault()', doc: t('`e.preventDefault()` — Prevents default behavior (e.g., form submission, link navigation)', '`e.preventDefault()` — デフォルト動作を防止（例: フォーム送信、リンク遷移）') },
  'stop': { detail: 'stopPropagation()', doc: t('`e.stopPropagation()` — Stops event bubbling', '`e.stopPropagation()` — イベントのバブリングを停止') },
  'once': { detail: t('Execute once', '一度だけ実行'), doc: t('Execute event listener once and automatically remove it (`{ once: true }`)', 'イベントリスナーを一度だけ実行し自動的に削除（`{ once: true }`）') },
  'self': { detail: 'target === currentTarget', doc: t('Execute only when event target is the element itself (ignore child bubble)', 'イベントターゲットが要素自身の場合のみ実行（子要素のバブルを無視）') },
  'capture': { detail: t('Capture phase', 'キャプチャフェーズ'), doc: t('Capture event in capture phase, not bubble phase (`{ capture: true }`)', 'バブルフェーズではなくキャプチャフェーズでイベントを捕捉（`{ capture: true }`）') },
  'enter': { detail: t('Enter key only', 'Enterキーのみ'), doc: t('Execute only when `e.key === "Enter"` (for keyboard events)', '`e.key === "Enter"` の場合のみ実行（キーボードイベント用）') },
  'esc': { detail: t('Escape key only', 'Escキーのみ'), doc: t('Execute only when `e.key === "Escape"` (for keyboard events)', '`e.key === "Escape"` の場合のみ実行（キーボードイベント用）') },
};

/**
 * 自動補完提供プロバイダー
 *
 * カーソル位置でのキーワードマッチに基づいて補完候補を返します。
 * ブロック検出により、script / template / meta / style に応じたフィルタリングを行います。
 * イベント属性内で `|` の後にカーソルがある場合、修飾子補完を提供します。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {vscode.Position} position - 補完位置
 * @returns {vscode.CompletionItem[]} 補完候補の配列
 */
function provideCompletionItems(document, position) {
  const line = document.lineAt(position).text;
  const beforeCursor = line.substring(0, position.character);
  const items = [];
  const block = detectBlock(document, position.line);

  // ── イベント修飾子の補完 ──
  // @click|、@submit|prevent| のようにパイプの後で修飾子を提案
  const modMatch = beforeCursor.match(/@[\w]+(?:\|[\w]*){0,10}\|(\w*)$/);
  if (modMatch && block === 'template') {
    // 既に使用されている修飾子を除外
    const existingMods = beforeCursor.match(/@[\w]+((?:\|\w+){0,10})\|\w*$/);
    const usedMods = existingMods && existingMods[1]
      ? existingMods[1].split('|').filter(Boolean)
      : [];
    const usedSet = new Set(usedMods);

    for (const [mod, config] of Object.entries(EVENT_MODIFIERS)) {
      if (usedSet.has(mod)) continue;
      const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.EnumMember);
      item.detail = config.detail;
      item.documentation = new vscode.MarkdownString(config.doc);
      item.sortText = `0-${mod}`; // 修飾子を優先表示
      items.push(item);
    }
    return items;
  }

  // ── テンプレート内の {{ }} 式でユーザーシンボルを補完 ──
  if (block === 'template') {
    const inInterp = beforeCursor.match(/\{\{[^}]*$/);
    if (inInterp) {
      const uri = document.uri.toString();
      const syms = documentSymbols.get(uri);
      if (syms) {
        for (const [name, sym] of syms) {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
          item.detail = `${sym.source} — ${sym.type || 'any'}`;
          const safeDoc1 = sym.doc ? sym.doc.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;') : '';
          item.documentation = new vscode.MarkdownString(
            `**${sym.source}** \`${name}\`${sym.type ? `: ${sym.type}` : ''}${safeDoc1 ? `\n\n${safeDoc1}` : ''}`
          );
          item.sortText = `0-${name}`; // ユーザーシンボルを優先
          items.push(item);
        }
      }
      return items;
    }
  }

  // ── ブロック別キーワードフィルタリング ──
  const wordMatch = beforeCursor.match(/[\w@:#-]*$/);
  if (wordMatch) {
    for (const [key, config] of Object.entries(COMPLETIONS)) {
      // ブロックに応じてフィルタリング
      if (block === 'script') {
        // scriptブロックではテンプレートディレクティブ・イベント・バインディングを除外
        if (key.startsWith('@') || key.startsWith(':') || key.startsWith('#') || key === '{{ }}' || key === 'slot' || key === 'ref=') continue;
        if (key === ':else' || key === ':else-if' || key === ':empty') continue;
        if (key === 'chasket' || key === 'chasket-minimal') continue;
      } else if (block === 'template') {
        // templateブロックではscriptキーワード・型関連を除外
        if (['state', 'const', 'let', 'prop', 'computed', 'emit', 'fn', 'watch', 'provide', 'consume', 'import', 'type', 'generic',
             'on mount', 'on unmount', 'on adopt', 'on formReset', 'on formAssociated', 'on formDisabled', 'on formStateRestore',
             'on update', 'on error', 'setFormValue', 'setValidity'].includes(key)) continue;
        if (key === 'chasket' || key === 'chasket-minimal') continue;
      } else if (block === 'meta') {
        // metaブロックではmeta固有キーワードとスキャフォールドのみ
        const META_COMPLETIONS = new Set(['name', 'shadow', 'form', 'generic', 'chasket', 'chasket-minimal']);
        if (!META_COMPLETIONS.has(key)) continue;
      } else if (block === 'style') {
        // styleブロックではCSSの補完に任せる（Chasket補完は出さない）
        continue;
      }

      const item = new vscode.CompletionItem(key, config.kind);
      item.detail = config.detail;
      if (config.insertText) item.insertText = new vscode.SnippetString(config.insertText);
      item.documentation = new vscode.MarkdownString(`**${key}** — ${config.detail}`);
      items.push(item);
    }

    // ── テンプレートブロックでイベントハンドラ値にユーザー定義fn/stateを補完 ──
    if (block === 'template') {
      const inEventVal = beforeCursor.match(/@[\w]+(?:\|[\w]+)*="(\w*)$/);
      if (inEventVal) {
        const uri = document.uri.toString();
        const syms = documentSymbols.get(uri);
        if (syms) {
          for (const [name, sym] of syms) {
            if (sym.source === 'fn' || sym.source === 'state' || sym.source === 'const') {
              const item = new vscode.CompletionItem(name, sym.source === 'fn' ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Variable);
              item.detail = `${sym.source} ${name}${sym.params ? `(${sym.params})` : ''}`;
              const safeDoc2 = sym.doc ? sym.doc.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;') : '';
              item.documentation = new vscode.MarkdownString(
                `**${sym.source}** \`${name}\`${safeDoc2 ? `\n\n${safeDoc2}` : ''}`
              );
              item.sortText = `0-${name}`;
              items.push(item);
            }
          }
        }
      }
    }
  }

  return items;
}

/**
 * JavaScript組み込みAPIのドット補完プロバイダー
 *
 * `console.` `window.` `document.` `Math.` `JSON.` `this.` 等のあとに
 * メンバー候補を提供します。`.` トリガー文字で呼び出されます。
 *
 * @param {vscode.TextDocument} document - テキストドキュメント
 * @param {vscode.Position} position - 補完位置
 * @returns {vscode.CompletionItem[]} 補完候補の配列
 */
function provideDotCompletion(document, position) {
  const line = document.lineAt(position).text;
  const beforeCursor = line.substring(0, position.character);
  const block = detectBlock(document, position.line);

  // scriptブロックまたはtemplateブロック内でのみ有効
  if (block !== 'script' && block !== 'template') return undefined;

  // `identifier.` パターンを検出（カーソル直前に `.` またはその後に部分入力がある）
  const dotMatch = beforeCursor.match(/(\w+)\.(\w*)$/);
  if (!dotMatch) return undefined;

  const objName = dotMatch[1];
  const partial = dotMatch[2]; // ドットの後に既に入力されている部分
  const members = JS_BUILTINS[objName];
  if (!members) return undefined;

  // 補完の置換範囲: ドットの直後からカーソル位置まで
  const dotIndex = beforeCursor.lastIndexOf('.');
  const replaceRange = new vscode.Range(
    position.line, dotIndex + 1,
    position.line, position.character
  );

  const items = [];
  for (const member of members) {
    const item = new vscode.CompletionItem(member.name, member.kind);
    item.detail = member.detail;
    if (member.doc) {
      item.documentation = new vscode.MarkdownString(member.doc);
    }
    item.sortText = `0-${member.name}`;
    item.filterText = member.name;
    item.range = replaceRange;
    items.push(item);
  }
  return new vscode.CompletionList(items, false);
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

        // 式から識別子を抽出（例: "count" or "Obj.method()" → "Obj" / "method"）
        const idMatch = expr.match(/^(\w+)/);
        if (idMatch) {
          const id = idMatch[1];
          if (syms.has(id)) {
            const sym = syms.get(id);
            // obj.method() パターン: word がメソッド名で、id がインポートオブジェクト名
            if (sym.source === 'import' && sym.importPath && word !== id) {
              const filePath = resolveImportFile(document, sym);
              if (filePath) {
                const result = findMemberInFile(filePath, word);
                if (result) {
                  return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(result.line, 0));
                }
                return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(0, 0));
              }
            }
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

    // ── FEATURE 1: Import-aware Go-to-Definition ──
    // If the symbol is imported, resolve the import path and jump to source file
    if (sym.source === 'import' && sym.importPath) {
      try {
        const docDir = path.dirname(document.uri.fsPath);
        let resolvedPath = path.resolve(docDir, sym.importPath);

        // Try different extensions: .ts, .js, .d.ts, original
        const extensions = ['.ts', '.js', '.d.ts'];
        let targetPath = null;

        for (const ext of extensions) {
          const candidate = resolvedPath + ext;
          if (fs.existsSync(candidate)) {
            targetPath = candidate;
            break;
          }
        }

        if (!targetPath && fs.existsSync(resolvedPath)) {
          targetPath = resolvedPath;
        }

        if (targetPath) {
          const targetUri = vscode.Uri.file(targetPath);

          // For named imports, try to find the export line in target file
          if (sym.importKind === 'named' && sym.importName) {
            try {
              const targetContent = fs.readFileSync(targetPath, 'utf8');
              const lines = targetContent.split('\n');
              const escaped = sym.importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

              // Comprehensive export patterns (matches Feature 3 validation)
              const exportPatterns = [
                new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class|abstract\\s+class|interface|type|enum)\\s+${escaped}\\b`),
                new RegExp(`\\bexport\\s+default\\s+${escaped}\\b`),
              ];

              // Search for export of this name
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (exportPatterns.some(p => p.test(line))) {
                  return new vscode.Location(targetUri, new vscode.Position(i, 0));
                }
                if (new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(line)) {
                  return new vscode.Location(targetUri, new vscode.Position(i, 0));
                }
              }
            } catch {
              // Fall back to file start if content read fails
            }
          }

          // Default: jump to start of file
          return new vscode.Location(targetUri, new vscode.Position(0, 0));
        }
      } catch {
        // If import resolution fails, fall back to same-file lookup
      }
    }

    return new vscode.Location(document.uri, new vscode.Position(sym.line, 0));
  }

  // ── FEATURE 1b: Go-to-definition for methods on imported objects ──
  // e.g. ReactiveNode.createReacterNode() — jump to createReacterNode in source file
  if (syms) {
    const lineText = line;
    // Use word start position (not cursor position) to check what's before the word
    const wordStartCol = wordRange ? wordRange.start.character : col;
    const beforeWord = lineText.substring(0, wordStartCol).match(/(\w+)\.\s*$/);
    if (beforeWord) {
      const objName = beforeWord[1];
      const sym = syms.get(objName);
      if (sym && sym.source === 'import' && sym.importPath) {
        const filePath = resolveImportFile(document, sym);
        if (filePath) {
          const result = findMemberInFile(filePath, word);
          if (result) {
            return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(result.line, 0));
          }
          // Method not found in file — jump to file top as fallback
          return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(0, 0));
        }
      }
    }
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
    diagnostics.push(mkDiag(0, 0, 0, 1, t('<template> block not found', '<template> ブロックが見つかりません'), 'error'));
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
        diagnostics.push(mkDiag(docLine, 0, docLine, line.length, t(`state '${m[1]}' requires an initial value (= value)`, `state '${m[1]}' には初期値（= value）が必要です`), 'error'));
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
              t(`watch dependency '${dep}' is not declared as state`, `watch の依存 '${dep}' が state として宣言されていません`), 'warning'));
          }
        }
      }
    }

    // ── FEATURE 1: Import statement parsing ──
    // Parse import statements and store them in symbols table
    // Patterns:
    //   import X from './file'              → default import "X"
    //   import { A, B } from './file'       → named imports "A", "B"
    //   import X, { A } from './file'       → default "X" + named "A"
    //   import * as X from './file'         → namespace "X"
    //   import type { X } from './file'     → type import (skip)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const docLine = scriptBlock.startLine + i + 1;
      let m;

      // Pattern 1: import type { ... } from '...' (skip)
      if (line.match(/^import\s+type\s+/)) continue;

      // Pattern 2: import X from 'path' (default import)
      if ((m = line.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/))) {
        symbols.set(m[1], {
          type: 'any',
          source: 'import',
          line: docLine,
          importPath: m[2],
          importKind: 'default',
          doc: getJsDoc(i)
        });
      }

      // Pattern 3: import * as X from 'path' (namespace)
      else if ((m = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/))) {
        symbols.set(m[1], {
          type: 'any',
          source: 'import',
          line: docLine,
          importPath: m[2],
          importKind: 'namespace',
          doc: getJsDoc(i)
        });
      }

      // Pattern 4: import { A, B, ... } from 'path' (named imports)
      else if ((m = line.match(/^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/))) {
        const names = m[1].split(',').map(n => n.trim());
        for (const name of names) {
          const simpleName = name.split(' as ')[0].trim();
          symbols.set(simpleName, {
            type: 'any',
            source: 'import',
            line: docLine,
            importPath: m[2],
            importKind: 'named',
            importName: simpleName,
            doc: getJsDoc(i)
          });
        }
      }

      // Pattern 5: import X, { A, B } from 'path' (default + named)
      else if ((m = line.match(/^import\s+(\w+)\s*,\s*\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/))) {
        const defaultName = m[1];
        const names = m[2].split(',').map(n => n.trim());

        symbols.set(defaultName, {
          type: 'any',
          source: 'import',
          line: docLine,
          importPath: m[3],
          importKind: 'default',
          doc: getJsDoc(i)
        });

        for (const name of names) {
          const simpleName = name.split(' as ')[0].trim();
          symbols.set(simpleName, {
            type: 'any',
            source: 'import',
            line: docLine,
            importPath: m[3],
            importKind: 'named',
            importName: simpleName,
            doc: getJsDoc(i)
          });
        }
      }
    }

    // ── FEATURE 3: Validate named imports against source/declaration files ──
    const docDir = path.dirname(document.uri.fsPath);
    for (const [name, sym] of symbols) {
      if (sym.source !== 'import' || !sym.importPath) continue;
      if (sym.importKind !== 'named' || !sym.importName) continue;

      try {
        const resolvedPath = path.resolve(docDir, sym.importPath);
        const escaped = sym.importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exportPatterns = [
          new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class|abstract\\s+class|interface|type|enum)\\s+${escaped}\\b`),
          new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`),
          new RegExp(`\\bexport\\s+default\\s+${escaped}\\b`),
        ];

        // Check ALL matching files (.d.ts, .ts, .js, original) — export may be in any of them
        const checkPaths = [];
        for (const ext of ['.d.ts', '.ts', '.js']) {
          const candidate = resolvedPath + ext;
          if (fs.existsSync(candidate)) checkPaths.push(candidate);
        }
        if (fs.existsSync(resolvedPath)) checkPaths.push(resolvedPath);
        if (checkPaths.length === 0) continue;

        const found = checkPaths.some(cp => {
          const content = fs.readFileSync(cp, 'utf8');
          return exportPatterns.some(p => p.test(content));
        });

        if (!found) {
          const escapedPath = sym.importPath.replace(/\\/g, '/');
          diagnostics.push(mkDiag(sym.line - 1, 0, sym.line - 1, 50,
            t(`'${sym.importName}' is not exported from '${escapedPath}'`, `'${sym.importName}' は '${escapedPath}' からエクスポートされていません`), 'warning'));
        }
      } catch {
        // Ignore resolution/read errors
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
                t(`'${methMatch[1]}' is 'number' type but '${methMatch[2]}' method does not exist — use String(${methMatch[1]})`, `'${methMatch[1]}' は 'number' 型ですが、'${methMatch[2]}' メソッドはありません — String(${methMatch[1]}) を使用してください`), 'error'));
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
            t(`undefined identifier '${id}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`, `未定義の識別子 '${id}'${suggestion ? ` — '${suggestion}' のことですか？` : ''}`), 'error'));
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
          const escapedFnName = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const fnDeclPattern = new RegExp(`\\bfn\\s+(?:async\\s+)?${escapedFnName}\\s*\\(`);
          if (fnDeclPattern.test(scriptText)) continue; // scriptに定義あり → 警告しない
          const col = em.index + em[1].length + 2; // @event=" の後
          diagnostics.push(mkDiag(docLine, col, docLine, col + handler.length,
            t(`event handler '${fnName}' is not defined in <script> — add fn ${fnName}() { ... }`, `イベントハンドラ '${fnName}' が <script> 内に定義されていません — fn ${fnName}() { ... } を追加してください`), 'warning'));
        }
      }

      // ── @html セキュリティ警告 ──
      // @html はHTMLをエスケープしないため、XSS対策が必須
      const htmlRe = /@html="([^"]*)"/g;
      let hm;
      while ((hm = htmlRe.exec(line)) !== null) {
        const col = hm.index;
        diagnostics.push(mkDiag(docLine, col, docLine, col + hm[0].length,
          t('@html is not escaped. XSS vulnerability risk. Use only with trusted data.', '@html はエスケープされません。XSS脆弱性のリスクがあります。信頼できるデータのみ使用してください'), 'warning'));
      }

      // ── 動的URL（:href, :src等）のセキュリティ警告 ──
      // JavaScript: URLインジェクション対策の必要性を警告
      const dynUrlRe = /:(href|src|action|formaction)="([^"]*)"/g;
      let dum;
      while ((dum = dynUrlRe.exec(line)) !== null) {
        const col = dum.index;
        diagnostics.push(mkDiag(docLine, col, docLine, col + dum[0].length,
          t(`dynamic :${dum[1]} — beware of javascript: URL injection`, `動的な :${dum[1]} は javascript: URL インジェクションに注意してください`), 'hint'));
      }

      // ── #for の必須属性チェック ──
      // each, of, key は必須
      if (line.match(/<#for\b/)) {
        if (!line.includes('each='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, t('#for: required attribute "each" is missing — each="variableName"', '#for: 必須属性 each が不足 — each="変数名"'), 'error'));
        if (!line.includes('of='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, t('#for: required attribute "of" is missing — of="arrayName"', '#for: 必須属性 of が不足 — of="配列名"'), 'error'));
        if (!line.includes('key='))
          diagnostics.push(mkDiag(docLine, 0, docLine, line.length, t('#for: required attribute "key" is missing — key="uniqueKey"', '#for: 必須属性 key が不足 — key="一意キー"'), 'error'));
      }

      // ── #if の必須属性チェック ──
      // condition は必須
      if (line.match(/<#if\b/) && !line.includes('condition='))
        diagnostics.push(mkDiag(docLine, 0, docLine, line.length, t('#if: required attribute "condition" is missing — condition="expression"', '#if: 必須属性 condition が不足 — condition="条件式"'), 'error'));
    }

    // ── ブロックの未閉じチェック ──
    // #if ブロックの開閉タグ数を比較
    const openIf = (tplContent.match(/<#if/g) || []).length;
    const closeIf = (tplContent.match(/<\/#if>/g) || []).length;
    if (openIf > closeIf)
      diagnostics.push(mkDiag(templateBlock.startLine + 1, 0, templateBlock.startLine + 1, 1,
        t(`unclosed #if block (opened: ${openIf}, closed: ${closeIf})`, `未閉じの #if ブロック（開: ${openIf}, 閉: ${closeIf}）`), 'error'));
    // #for ブロックの開閉タグ数を比較
    const openFor = (tplContent.match(/<#for/g) || []).length;
    const closeFor = (tplContent.match(/<\/#for>/g) || []).length;
    if (openFor > closeFor)
      diagnostics.push(mkDiag(templateBlock.startLine + 1, 0, templateBlock.startLine + 1, 1,
        t(`unclosed #for block (opened: ${openFor}, closed: ${closeFor})`, `未閉じの #for ブロック（開: ${openFor}, 閉: ${closeFor}）`), 'error'));

    // ── 未使用 state の検出 ──
    // テンプレートと他の fn/watch内で使用されていない state を警告
    for (const [name, sym] of symbols) {
      if (sym.source !== 'state') continue;
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escapedName}\\b`);
      if (re.test(tplContent)) continue; // テンプレートで使用されている
      // スクリプト内の使用確認
      let usedInScript = false;
      if (scriptBlock) {
        const sLines = scriptBlock.content.split('\n');
        const declIdx = sLines.findIndex(l => l.trim().startsWith(`state ${name}`));
        sLines.forEach((l, idx) => { if (idx !== declIdx && re.test(l)) usedInScript = true; });
      }
      if (!usedInScript)
        diagnostics.push(mkDiag(sym.line, 0, sym.line, 1, t(`state '${name}' is declared but not used`, `state '${name}' が宣言されましたが使用されていません`), 'warning'));
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
          t(`custom element name '${m[1]}' requires a hyphen (e.g., x-${m[1]})`, `カスタム要素名 '${m[1]}' にはハイフンが必要です（例: x-${m[1]}）`), 'error'));
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
