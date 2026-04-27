
/**
 * テンプレート文字列
 */
type BlockType = 'meta' | 'script' | 'template' | 'style';


/**
 * テンプレートブロック
 */
type TemplateBlock = {
    type: BlockType,
    content: string,
    startLine: number
}


/**
 * 分割エラー
 */
type SplitError = {
  phase: 'split',
  kind: 'no-template' | 'multiple-templates',
  count?: number,
  positions?: number[],
};
