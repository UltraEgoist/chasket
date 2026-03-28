pub mod ast;
pub mod splitter;
pub mod parser;
pub mod types;
pub mod checker;
pub mod codegen;

use ast::*;
use checker::TypeChecker;

/// Compilation result
#[derive(Debug)]
pub struct CompileResult {
    pub success: bool,
    pub output: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub ast: Option<Component>,
}

/// Compilation options
#[derive(Debug, Clone, Default)]
pub struct CompileOptions {
    pub target: CompileTarget,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub enum CompileTarget {
    #[default]
    Js,
    Ts,
}

/// Compile a .csk source file to JavaScript (or TypeScript).
pub fn compile(source: &str, file_name: &str, options: Option<CompileOptions>) -> CompileResult {
    let opts = options.unwrap_or_default();

    // Phase 1: Split blocks
    let blocks = splitter::split_blocks(source);

    // Must have a <template> block
    if !blocks.iter().any(|b| b.block_type == BlockType::Template) {
        return CompileResult {
            success: false,
            output: None,
            diagnostics: vec![Diagnostic {
                level: DiagLevel::Error,
                code: "E0002".into(),
                message: "<template> ブロックが見つかりません".into(),
                span: None,
                hint: None,
            }],
            ast: None,
        };
    }

    // Phase 2: Parse each block
    let mut meta = Meta::default();
    let mut script: Vec<Decl> = Vec::new();
    let mut template: Vec<TemplateNode> = Vec::new();
    let mut style: Option<String> = None;

    for block in &blocks {
        match block.block_type {
            BlockType::Meta => meta = parser::parse_meta(&block.content),
            BlockType::Script => script = parser::parse_script(&block.content, block.start_line),
            BlockType::Template => template = parser::parse_template_nodes(&block.content.trim()),
            BlockType::Style => style = Some(block.content.trim().to_string()),
        }
    }

    // Default name from file_name
    if meta.name.is_none() {
        let base = file_name
            .trim_end_matches(".csk")
            .chars()
            .flat_map(|c| {
                if c.is_uppercase() {
                    vec!['-', c.to_lowercase().next().unwrap()]
                } else {
                    vec![c]
                }
            })
            .collect::<String>();
        meta.name = Some(format!("x-{}", base));
    }

    let component = Component {
        meta,
        script,
        template,
        style,
        file_name: file_name.to_string(),
    };

    // Phase 3: Type check
    let mut checker = TypeChecker::new(&component);
    let diagnostics = checker.check();

    if diagnostics.iter().any(|d| d.level == DiagLevel::Error) {
        return CompileResult {
            success: false,
            output: None,
            diagnostics,
            ast: Some(component),
        };
    }

    // Phase 4: Code generation
    let output = codegen::generate(&component, &opts);

    CompileResult {
        success: true,
        output: Some(output),
        diagnostics,
        ast: Some(component),
    }
}
