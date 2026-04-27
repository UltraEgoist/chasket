


/**
 * Split error types for the splitting phase.
 */
const splitError = {
/**
 * Error when no template block is found.
 * @returns {SplitError} The split error object.
 */
  NoTemplate: () => ({
    phase: 'split',
    kind: 'no-template',
  }),
  /**
   * Error when multiple template blocks are found.
   * @param {*} count - The number of template blocks found.
   * @param {*} positions - The positions of the template blocks.
   * @returns {SplitError} The split error object.
   */
  MultipleTemplates: (count, positions) => ({
    phase: 'split',
    kind: 'multiple-templates',
    count,
    positions,
  }),
};

/**
 * splitErrorのハンドリング
 * @param {SplitError} error
 * @returns {{}}
 */
const errorHandler = (error) => {
  // テンプレートが存在しない場合のエラー
  if(error.kind === 'no-template') {
    return {
      success:false,
      diagnostics:[{
        level:'error',
        code:'E0001',
        message:msg('E0001')
      }]
    } 
  } 

  // #TODO: 失敗の具体的な内容は未定
  if(error.kind === 'multiple-templates') {
    return {};
  }
};

// ============================================================
// Exports
// ============================================================

module.exports = {
    splitError,
    errorHandler
};
