// ============================================================
// PHASE 1: Block Splitter
// ============================================================



//  * @returns {Array<{type: string, content: string, startLine: number}>} Extracted blocks
/**
 * Phase 1: Split source file into semantic blocks.
 *
 * Extracts <meta>, <script>, <template>, <style> blocks using regex.
 * Normalizes line breaks and tracks line numbers for diagnostics.
 *
 * @param {string} source - Raw .csk file content
 * @returns {TemplateBlock[]} Extracted blocks
 * @description
 * この関数は .csk ファイルをセマンティックブロックに分割します。
 * 各ブロックには開始行番号が記録され、エラー診断に使用されます。
 */
function splitBlocks(source) {
  // Normalize CRLF (Windows) and CR (old Mac) line breaks to LF (Unix)
  source = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  /** @type {TemplateBlock[]} */
  const blocks = [];
  // Regex captures: (1) block type, (2) attributes (optional), (3) block content
  // Using [\s\S]*? for non-greedy any-character matching (including newlines)
  const re = /<(meta|script|template|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    blocks.push({
      type: m[1],         // Block type: 'meta', 'script', 'template', or 'style'
      content: m[3],      // Block content (everything between opening and closing tags)
      startLine: source.substring(0, m.index).split('\n').length,  // 1-indexed line number
    });
  }
  return blocks;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    splitBlocks
};
