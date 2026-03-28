/**
 * @fileoverview Internationalization (i18n) message catalog for Chasket compiler
 *
 * Supports Japanese (ja) and English (en) locales for error and diagnostic messages.
 * Locale detection: environment variables CHASKET_LANG or LANG, with fallback to 'en'.
 */

// ============================================================
// Message catalog: error codes and their translations
// ============================================================

const MESSAGES = {
  // E0001: Missing template block
  E0001: {
    en: 'Template block is required',
    ja: '<template> ブロックが見つかりません'
  },

  // E0003: Invalid component name
  E0003: {
    en: 'Invalid component name "{name}": lowercase alphanumeric and hyphens only, must contain at least one hyphen (e.g., "x-my-component")',
    ja: '無効なコンポーネント名 "{name}": 小文字英数字とハイフンのみ使用可能で、ハイフンを1つ以上含む必要があります (例: "x-my-component")'
  },

  // E0004: Template parse error
  E0004: {
    en: 'Template parse error: {error}',
    ja: 'テンプレートパースエラー: {error}'
  },

  // E0201: State initial value type mismatch
  E0201: {
    en: 'State "{id}" initial value type mismatch',
    ja: 'state "{id}" の初期値の型が一致しません'
  },

  // E0202: Prop default value type mismatch
  E0202: {
    en: 'Prop "{id}" default value type mismatch',
    ja: 'prop "{id}" のデフォルト値の型が一致しません'
  },

  // E0301: Undefined identifier
  E0301: {
    en: 'Undefined identifier "{id}"',
    ja: '未定義の識別子 "{id}"'
  },

  // E0302: Method not available on type
  E0302: {
    en: '"{id}" is of type "{type}" but method "{method}" does not exist',
    ja: '"{id}" は "{type}" 型ですが、"{method}" メソッドはありません'
  },

  // E0401: Invalid event handler
  E0401: {
    en: 'Invalid event handler: {reason}',
    ja: '無効なイベントハンドラー: {reason}'
  },

  // E0401 variants for specific reasons
  E0401_EMPTY: {
    en: 'Event handler cannot be empty',
    ja: 'イベントハンドラーを空にすることはできません'
  },

  E0401_KEYWORD: {
    en: 'Invalid event handler: cannot contain "{keyword}"',
    ja: '無効なイベントハンドラー: "{keyword}" を含むことはできません'
  },

  E0401_SEMICOLON: {
    en: 'Invalid event handler: cannot contain multiple statements (semicolon)',
    ja: '無効なイベントハンドラー: 複数の文を含むことはできません (セミコロン)'
  },

  E0401_STRING: {
    en: 'Invalid event handler: cannot contain string literals',
    ja: '無効なイベントハンドラー: 文字列リテラルを含むことはできません'
  },

  E0401_TEMPLATE_LIT: {
    en: 'Invalid event handler: cannot contain template literals',
    ja: '無効なイベントハンドラー: テンプレートリテラルを含むことはできません'
  },

  E0401_COMMENT: {
    en: 'Invalid event handler: cannot contain comments',
    ja: '無効なイベントハンドラー: コメントを含むことはできません'
  },

  E0401_DESTRUCTURE: {
    en: 'Invalid event handler: cannot contain destructuring or spread operators',
    ja: '無効なイベントハンドラー: 分割代入やスプレッド演算子を含むことはできません'
  },

  E0401_REGEX: {
    en: 'Invalid event handler: cannot contain regex literals',
    ja: '無効なイベントハンドラー: 正規表現リテラルを含むことはできません'
  },

  // W0101: Unused state variable
  W0101: {
    en: 'State "{id}" is declared but never used',
    ja: 'state "{id}" が宣言されましたが使用されていません'
  },

  // W0201: @html directive warning
  W0201: {
    en: '@html is not escaped. There is an XSS risk; use only with trusted data',
    ja: '@html はエスケープされません。XSSリスクがあるため、信頼できるデータのみ使用してください'
  },

  // W0202: Dynamic href/src warning
  W0202: {
    en: 'Dynamic :{attr} has a risk of javascript: URL injection. Validate the input',
    ja: '動的な :{attr} は javascript: URL インジェクションのリスクがあります。入力を検証してください'
  },

  // W0203: Static id attribute warning
  W0203: {
    en: 'Static id attribute may be duplicated on re-render. Use :key or move outside the loop',
    ja: '静的な id 属性は再レンダリング時に複製されます。:key を使用するか、ループ外に移動してください'
  },

  // W0204: Forward reference warning
  W0204: {
    en: 'Computed "{id}" references "{dep}" declared later',
    ja: 'computed "{id}" は後で宣言された "{dep}" を参照しています'
  },

  // W0210: Raw interpolation {{{ }}} security warning
  W0210: {
    en: '{{{ }}} raw interpolation bypasses HTML escaping. XSS risk if used with untrusted data. Use {{ }} for safe output',
    ja: '{{{ }}} 生補間は HTML エスケープをバイパスします。信頼できないデータに使用すると XSS リスクがあります。安全な出力には {{ }} を使用してください'
  },

  // W0211: Suspicious event handler expression
  W0211: {
    en: 'Event handler contains potentially unsafe pattern: {reason}. Consider moving logic to a fn block',
    ja: 'イベントハンドラに安全でない可能性のあるパターンが含まれています: {reason}。ロジックを fn ブロックに移動することを検討してください'
  },

  // W0301: Watch dependency path warning
  W0301: {
    en: 'Watch dependency "{dep}" contains nested path (obj.field). Generated code may be invalid. Use only top-level state',
    ja: 'watch dep "{dep}" がネストされたパス（obj.field）を含んでいます。生成されたコードが無効になります。トップレベルの state のみを使用してください'
  },

  // W0302: Unrecognized import format warning
  W0302: {
    en: 'Unrecognized import format. Multi-line imports are not supported. Use single-line syntax: import { ... } from "module"',
    ja: '認識できないインポート形式です。複数行のインポートはサポートされていません。1行形式を使用してください: import { ... } from "module"'
  },

  // CLI Messages
  CLI_INIT_INVALID_NAME: {
    en: 'Invalid project name: "{name}". Use lowercase letters, numbers, hyphens, underscores, and dots only',
    ja: '無効なプロジェクト名: "{name}". 小文字、数字、ハイフン、アンダースコア、ドットのみ使用できます'
  },

  CLI_INIT_EXISTS: {
    en: 'Directory "{dir}" already exists',
    ja: 'ディレクトリ "{dir}" は既に存在します'
  },

  CLI_INIT_NO_NAME: {
    en: 'Usage: chasket init <project-name>',
    ja: 'Usage: chasket init <project-name>'
  },

  CLI_BUILD_NO_SRC: {
    en: 'Source directory not found: {path}',
    ja: 'ソースディレクトリが見つかりません: {path}'
  },

  CLI_BUILD_NO_FILES: {
    en: 'No .csk files found: {path}',
    ja: '.csk ファイルが見つかりません: {path}'
  },

  CLI_CHECK_NO_SRC: {
    en: 'Source directory not found: {path}',
    ja: 'ソースディレクトリが見つかりません: {path}'
  },

  CLI_DEV_PORT_INVALID: {
    en: 'Error: Invalid port number (must be 1-65535)',
    ja: 'エラー: 無効なポート番号です（1〜65535の範囲で指定してください）'
  },

  CLI_DEV_PORT_IN_USE: {
    en: 'Port {port} is already in use. Specify a different port:',
    ja: 'ポート {port} は既に使用されています。別のポートを指定してください:'
  },

  CLI_CONFIG_PARSE_ERROR: {
    en: 'Warning: chasket.config.json parse failed: {error}',
    ja: '⚠ Warning: chasket.config.json のパース失敗: {error}'
  },

  CLI_BANNER_VERSION: {
    en: 'Chasket v{version}',
    ja: 'Chasket v{version}'
  },

  CLI_BANNER_BUILD: {
    en: 'Chasket v{version}',
    ja: 'Chasket v{version}'
  },

  CLI_BUILD_COMPILING: {
    en: 'Compiling {file}...',
    ja: 'Compiling {file}...'
  },

  CLI_BUILD_SUCCESS: {
    en: '✓ Done!',
    ja: '✓ Done!'
  },

  CLI_BUILD_NEXT_STEPS: {
    en: 'Next steps:',
    ja: '次のステップ:'
  },

  CLI_BUILD_COMPILED: {
    en: 'Done! {success}/{total} files compiled.',
    ja: 'Done! {success}/{total} files compiled.'
  },

  CLI_CHECK_TITLE: {
    en: 'Chasket Check',
    ja: 'Chasket Check'
  },

  CLI_DEV_SERVER: {
    en: 'Dev server: {url}',
    ja: 'Dev server: {url}'
  },

  CLI_DEV_WATCHING: {
    en: 'Watching {path} for changes...',
    ja: 'Watching {path} for changes...'
  },

  CLI_DEV_RECOMPILING: {
    en: '{file} changed, recompiling...',
    ja: '{file} changed, recompiling...'
  },

  CLI_BUILD_ERROR: {
    en: 'Build error: {error}',
    ja: 'Build error: {error}'
  },

  CLI_HELP_TITLE: {
    en: 'Chasket - Web Component Compiler',
    ja: 'Chasket - Web Component Compiler'
  },

  CLI_HELP_USAGE: {
    en: 'Usage:',
    ja: 'Usage:'
  },

  CLI_HELP_INIT: {
    en: 'chasket init <name>        Create new project',
    ja: 'chasket init <name>        新規プロジェクト作成'
  },

  CLI_HELP_DEV: {
    en: 'chasket dev                Start dev server (HMR)',
    ja: 'chasket dev                開発サーバー起動 (HMR)'
  },

  CLI_HELP_BUILD: {
    en: 'chasket build              Production build',
    ja: 'chasket build              本番ビルド'
  },

  CLI_HELP_CHECK: {
    en: 'chasket check              Type check only',
    ja: 'chasket check              型チェックのみ'
  },

  CLI_HELP_OPTIONS: {
    en: 'Options:',
    ja: 'Options:'
  },

  CLI_HELP_TARGET: {
    en: '--target js|ts           Output format (default: js)',
    ja: '--target js|ts           出力フォーマット (default: js)'
  },

  CLI_HELP_OUTDIR: {
    en: '--outdir <dir>           Output directory (default: dist)',
    ja: '--outdir <dir>           出力先ディレクトリ (default: dist)'
  },

  CLI_HELP_PORT: {
    en: '--port <number>          Dev server port (default: 3000)',
    ja: '--port <number>          dev server ポート (default: 3000)'
  },

  CLI_HELP_VERSION: {
    en: '-v, --version            Show version',
    ja: '-v, --version            バージョン表示'
  },

  CLI_HELP_HELP: {
    en: '-h, --help               Show help',
    ja: '-h, --help               ヘルプ表示'
  },
};

// ============================================================
// Locale detection and management
// ============================================================

let currentLocale = detectLocale();

/**
 * Detect the current locale from environment variables
 * Priority: CHASKET_LANG > LANG > default to 'en'
 * @returns {string} 'ja' or 'en'
 */
function detectLocale() {
  let lang = process.env.CHASKET_LANG || process.env.LANG || 'en';

  // Extract language code from locale string (e.g., 'ja_JP' -> 'ja')
  if (lang.includes('_')) {
    lang = lang.split('_')[0];
  }
  if (lang.includes('-')) {
    lang = lang.split('-')[0];
  }
  if (lang.includes('.')) {
    lang = lang.split('.')[0];
  }

  // Support full locale strings (ja-JP, en-US, etc.)
  lang = lang.toLowerCase().trim();

  // Validate: only 'ja' and 'en' are supported
  return (lang === 'ja') ? 'ja' : 'en';
}

/**
 * Get a localized message by code and optional parameters
 *
 * @param {string} code - Message code (e.g., 'E0301', 'CLI_BUILD_ERROR')
 * @param {Object} params - Optional template parameters
 * @returns {string} Localized message with substituted parameters
 *
 * @example
 * msg('E0301', { id: 'count' })
 * // => 'Undefined identifier "count"' (en) or '未定義の識別子 "count"' (ja)
 *
 * msg('CLI_BUILD_ERROR', { error: 'ENOENT' })
 * // => 'Build error: ENOENT'
 */
function msg(code, params = {}) {
  const entry = MESSAGES[code];

  if (!entry) {
    // Fallback: return the code itself if not found
    return code;
  }

  let text = entry[currentLocale] || entry.en;

  // Substitute parameters: {key} -> value
  Object.entries(params).forEach(([key, value]) => {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  });

  return text;
}

/**
 * Override the current locale
 * @param {string} lang - 'ja' or 'en'
 */
function setLocale(lang) {
  currentLocale = (lang === 'ja') ? 'ja' : 'en';
}

/**
 * Get the current locale
 * @returns {string} 'ja' or 'en'
 */
function getLocale() {
  return currentLocale;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  msg,
  setLocale,
  getLocale,
  MESSAGES,
};
