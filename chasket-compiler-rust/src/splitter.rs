use regex::Regex;

use crate::ast::{Block, BlockType};

/// Phase 1: Split source into blocks (meta, script, template, style).
pub fn split_blocks(source: &str) -> Vec<Block> {
    let tags = [
        ("meta", BlockType::Meta),
        ("script", BlockType::Script),
        ("template", BlockType::Template),
        ("style", BlockType::Style),
    ];

    let mut blocks: Vec<(usize, Block)> = Vec::new();

    for (tag, block_type) in &tags {
        let pattern = format!(r"(?s)<{}(\s[^>]*)?>(.+?)</{}>", tag, tag);
        let re = Regex::new(&pattern).unwrap();
        for cap in re.captures_iter(source) {
            let content = cap[2].to_string();
            let byte_start = cap.get(0).unwrap().start();
            let start_line = source[..byte_start]
                .chars()
                .filter(|&c| c == '\n')
                .count()
                + 1;

            blocks.push((byte_start, Block {
                block_type: block_type.clone(),
                content,
                start_line,
            }));
        }
    }

    // Sort by source order
    blocks.sort_by_key(|(pos, _)| *pos);
    blocks.into_iter().map(|(_, b)| b).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_basic() {
        let src = r#"<meta>
  name: "x-hello"
  shadow: open
</meta>
<script>
  state count: number = 0
</script>
<template>
  <div>{{ count }}</div>
</template>
<style>
  div { color: red; }
</style>"#;
        let blocks = split_blocks(src);
        assert_eq!(blocks.len(), 4);
        assert_eq!(blocks[0].block_type, BlockType::Meta);
        assert_eq!(blocks[1].block_type, BlockType::Script);
        assert_eq!(blocks[2].block_type, BlockType::Template);
        assert_eq!(blocks[3].block_type, BlockType::Style);
    }

    #[test]
    fn test_split_no_script() {
        let src = r#"<meta>
  name: "x-test"
  shadow: open
</meta>
<template>
  <div>Hello</div>
</template>"#;
        let blocks = split_blocks(src);
        assert_eq!(blocks.len(), 2);
    }
}
