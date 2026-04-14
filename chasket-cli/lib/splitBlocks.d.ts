
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