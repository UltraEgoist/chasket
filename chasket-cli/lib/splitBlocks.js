// ============================================================
// PHASE 1: Block Splitter
// ============================================================


const { Result } = require('./common/result');
const { splitError } = require('./error/splitError');


/**
 * Phase 1: Split source file into semantic blocks.
 *
 * Extracts <meta>, <script>, <template>, <style> blocks using regex.
 * Normalizes line breaks and tracks line numbers for diagnostics.
 *
 * @param {string} source - Raw .csk file content
 * @returns {Result<TemplateBlock[], SplitError>} Extracted blocks
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
  // パースで配列が生成されなくなるまで処理し続ける
  while ((m = re.exec(source)) !== null) {
    blocks.push({
      type: m[1],         // Block type: 'meta', 'script', 'template', or 'style'
      content: m[3],      // Block content (everything between opening and closing tags)
      startLine: source.substring(0, m.index).split('\n').length,  // 1-indexed line number
    });
  }

  // templateは必須なので、templateがない場合は
  if (blocks.filter(block => block.type === 'template').length === 0) {
    return Result.Err(splitError.NoTemplate());
  }

  // templateは1つだけ許可される
  if (blocks.filter(block => block.type === 'template').length > 1) {
    return Result.Err(splitError.MultipleTemplates(blocks.length, positions));
  }

  // 成功時にtemplateブロックを返す
  return Result.Ok(blocks);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    splitBlocks
};
