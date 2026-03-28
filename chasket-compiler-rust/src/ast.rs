use serde::{Deserialize, Serialize};

// ─── Source Span ───
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Span {
    pub line: usize,
}

// ─── Type System ───
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChasketType {
    Primitive { name: String },
    Array { element: Box<ChasketType> },
    Union { types: Vec<ChasketType> },
    Literal { value: String },
    Object { fields: Vec<ObjectField> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectField {
    pub name: String,
    pub field_type: ChasketType,
    pub optional: bool,
}

// ─── Block Types ───
#[derive(Debug, Clone, PartialEq)]
pub enum BlockType {
    Meta,
    Script,
    Template,
    Style,
}

#[derive(Debug, Clone)]
pub struct Block {
    pub block_type: BlockType,
    pub content: String,
    pub start_line: usize,
}

// ─── Meta ───
#[derive(Debug, Clone, Default)]
pub struct Meta {
    pub name: Option<String>,
    pub shadow: Option<String>,
    pub form: bool,
    pub extends: Option<String>,
}

// ─── Script Declarations ───
#[derive(Debug, Clone)]
pub enum Decl {
    Import {
        default_import: Option<String>,
        named_imports: Option<Vec<String>>,
        from: String,
        span: Span,
    },
    Type {
        name: String,
        type_def: ChasketType,
        span: Span,
    },
    State {
        name: String,
        type_ann: ChasketType,
        init: String,
        span: Span,
    },
    Prop {
        name: String,
        type_ann: ChasketType,
        default: Option<String>,
        span: Span,
    },
    Computed {
        name: String,
        type_ann: ChasketType,
        expr: String,
        span: Span,
    },
    Emit {
        name: String,
        type_ann: ChasketType,
        options: EmitOptions,
        span: Span,
    },
    Ref {
        name: String,
        type_ann: ChasketType,
        span: Span,
    },
    Fn {
        name: String,
        is_async: bool,
        params: Vec<FnParam>,
        return_type: Option<ChasketType>,
        body: String,
        span: Span,
    },
    Lifecycle {
        event: LifecycleEvent,
        body: String,
        span: Span,
    },
    Watch {
        deps: Vec<String>,
        body: String,
        span: Span,
    },
    Provide {
        name: String,
        type_ann: ChasketType,
        init: String,
        span: Span,
    },
    Consume {
        name: String,
        type_ann: ChasketType,
        span: Span,
    },
}

#[derive(Debug, Clone)]
pub struct EmitOptions {
    pub bubbles: bool,
    pub composed: bool,
}

impl Default for EmitOptions {
    fn default() -> Self {
        Self {
            bubbles: true,
            composed: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FnParam {
    pub name: String,
    pub type_ann: ChasketType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LifecycleEvent {
    Mount,
    Unmount,
    Adopt,
}

// ─── Template Nodes ───
#[derive(Debug, Clone)]
pub enum TemplateNode {
    Text {
        value: String,
    },
    Interpolation {
        expr: String,
    },
    Element {
        tag: String,
        attrs: Vec<Attr>,
        children: Vec<TemplateNode>,
        self_closing: bool,
    },
    If {
        condition: String,
        children: Vec<TemplateNode>,
        else_if_chain: Option<Vec<ElseIfBranch>>,
        else_children: Option<Vec<TemplateNode>>,
    },
    For {
        each: String,
        index: Option<String>,
        of: String,
        key: String,
        children: Vec<TemplateNode>,
        empty_children: Option<Vec<TemplateNode>>,
    },
}

#[derive(Debug, Clone)]
pub struct ElseIfBranch {
    pub condition: String,
    pub children: Vec<TemplateNode>,
}

#[derive(Debug, Clone)]
pub struct Attr {
    pub name: String,
    pub value: String,
    pub dynamic: bool,
    pub event: bool,
    pub bind: bool,
    pub is_ref: bool,
    pub modifiers: Vec<String>,
    pub html: bool,
    pub spread: bool,
}

// ─── Diagnostics ───
#[derive(Debug, Clone, PartialEq)]
pub enum DiagLevel {
    Error,
    Warning,
    Hint,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub level: DiagLevel,
    pub code: String,
    pub message: String,
    pub span: Option<Span>,
    pub hint: Option<String>,
}

// ─── Component ───
#[derive(Debug, Clone)]
pub struct Component {
    pub meta: Meta,
    pub script: Vec<Decl>,
    pub template: Vec<TemplateNode>,
    pub style: Option<String>,
    pub file_name: String,
}
