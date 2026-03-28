use std::collections::{HashMap, HashSet};

use crate::ast::*;

/// Symbol table entry
struct Symbol {
    type_ann: ChasketType,
    source: String, // "state", "prop", "computed", "fn", "emit", "ref", "loop", "provide", "consume"
}

/// Phase 3: Type Checker
pub struct TypeChecker<'a> {
    component: &'a Component,
    symbols: HashMap<String, Symbol>,
    type_aliases: HashMap<String, ChasketType>,
    diags: Vec<Diagnostic>,
}

impl<'a> TypeChecker<'a> {
    pub fn new(component: &'a Component) -> Self {
        Self {
            component,
            symbols: HashMap::new(),
            type_aliases: HashMap::new(),
            diags: Vec::new(),
        }
    }

    pub fn check(&mut self) -> Vec<Diagnostic> {
        self.build_symbols();
        self.check_script();
        self.check_template(&self.component.template.clone());
        self.check_unused();
        self.diags.clone()
    }

    fn build_symbols(&mut self) {
        for d in &self.component.script {
            match d {
                Decl::State { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "state".into(),
                        },
                    );
                }
                Decl::Prop { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "prop".into(),
                        },
                    );
                }
                Decl::Computed { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "computed".into(),
                        },
                    );
                }
                Decl::Fn {
                    name, return_type, ..
                } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: return_type.clone().unwrap_or(ChasketType::Primitive {
                                name: "void".into(),
                            }),
                            source: "fn".into(),
                        },
                    );
                }
                Decl::Emit { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "emit".into(),
                        },
                    );
                }
                Decl::Ref { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "ref".into(),
                        },
                    );
                }
                Decl::Provide { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "provide".into(),
                        },
                    );
                }
                Decl::Consume { name, type_ann, .. } => {
                    self.symbols.insert(
                        name.clone(),
                        Symbol {
                            type_ann: type_ann.clone(),
                            source: "consume".into(),
                        },
                    );
                }
                Decl::Type {
                    name, type_def, ..
                } => {
                    self.type_aliases.insert(name.clone(), type_def.clone());
                }
                _ => {}
            }
        }
    }

    fn check_script(&mut self) {
        for d in &self.component.script {
            if let Decl::State {
                name,
                type_ann,
                init,
                span,
            } = d
            {
                let inferred = self.infer(init);
                if let Some(from) = inferred {
                    if !self.assignable(&from, type_ann) {
                        self.diags.push(Diagnostic {
                            level: DiagLevel::Error,
                            code: "E0201".into(),
                            message: format!("state '{}' の初期値の型が一致しません", name),
                            span: Some(span.clone()),
                            hint: None,
                        });
                    }
                }
            }
        }
    }

    fn check_template(&mut self, nodes: &[TemplateNode]) {
        for n in nodes {
            match n {
                TemplateNode::Interpolation { expr } => {
                    self.check_interp(expr);
                }
                TemplateNode::Element {
                    attrs, children, ..
                } => {
                    for a in attrs {
                        if a.dynamic || a.bind {
                            self.check_vars(&a.value);
                        }
                        if a.html {
                            self.diags.push(Diagnostic {
                                level: DiagLevel::Warning,
                                code: "W0201".into(),
                                message: "@html はエスケープされません。XSSリスクがあるため、信頼できるデータのみ使用してください".into(),
                                span: None,
                                hint: None,
                            });
                        }
                        if a.dynamic && (a.name == "href" || a.name == "src") {
                            self.diags.push(Diagnostic {
                                level: DiagLevel::Warning,
                                code: "W0202".into(),
                                message: format!("動的な :{} は javascript: URL インジェクションのリスクがあります。入力を検証してください", a.name),
                                span: None,
                                hint: None,
                            });
                        }
                    }
                    self.check_template(children);
                }
                TemplateNode::If {
                    condition,
                    children,
                    else_if_chain,
                    else_children,
                } => {
                    self.check_vars(condition);
                    self.check_template(children);
                    if let Some(chain) = else_if_chain {
                        for branch in chain {
                            self.check_vars(&branch.condition);
                            self.check_template(&branch.children);
                        }
                    }
                    if let Some(ec) = else_children {
                        self.check_template(ec);
                    }
                }
                TemplateNode::For {
                    each,
                    index,
                    of,
                    children,
                    empty_children,
                    ..
                } => {
                    self.check_vars(of);
                    // Add loop variables temporarily
                    self.symbols.insert(
                        each.clone(),
                        Symbol {
                            type_ann: ChasketType::Primitive {
                                name: "string".into(),
                            },
                            source: "loop".into(),
                        },
                    );
                    if let Some(idx) = index {
                        self.symbols.insert(
                            idx.clone(),
                            Symbol {
                                type_ann: ChasketType::Primitive {
                                    name: "number".into(),
                                },
                                source: "loop".into(),
                            },
                        );
                    }
                    self.check_template(children);
                    if let Some(ec) = empty_children {
                        self.check_template(ec);
                    }
                    self.symbols.remove(each);
                    if let Some(idx) = index {
                        self.symbols.remove(idx);
                    }
                }
                TemplateNode::Text { .. } => {}
            }
        }
    }

    fn check_interp(&mut self, expr: &str) {
        // Check for calling string methods on numbers
        let re = regex::Regex::new(r"^(\w+)\.(\w+)\(").unwrap();
        if let Some(m) = re.captures(expr) {
            let var_name = &m[1];
            let method = &m[2];
            if let Some(sym) = self.symbols.get(var_name) {
                if let ChasketType::Primitive { name } = &sym.type_ann {
                    let str_methods = [
                        "toUpperCase",
                        "toLowerCase",
                        "trim",
                        "split",
                        "replace",
                        "includes",
                        "startsWith",
                        "endsWith",
                        "indexOf",
                        "slice",
                    ];
                    if name == "number" && str_methods.contains(&method) {
                        self.diags.push(Diagnostic {
                            level: DiagLevel::Error,
                            code: "E0302".into(),
                            message: format!(
                                "'{}' は 'number' 型ですが、'{}' メソッドはありません",
                                var_name, method
                            ),
                            span: None,
                            hint: Some(format!("String({}) に変換してください", var_name)),
                        });
                    }
                }
            }
        }
        self.check_vars(expr);
    }

    fn check_vars(&mut self, expr: &str) {
        let reserved: HashSet<&str> = [
            "true", "false", "null", "undefined", "void", "typeof", "instanceof", "new", "return",
            "if", "else", "for", "while", "const", "let", "var", "function", "class", "this",
            "super", "import", "export", "from", "await", "async", "try", "catch", "finally",
            "throw", "length", "map", "filter", "reduce", "push", "pop", "trim", "includes",
            "indexOf", "slice", "splice", "concat", "join", "split", "toFixed", "toString",
            "toUpperCase", "toLowerCase", "replace", "match", "startsWith", "endsWith",
            "parseInt", "parseFloat", "String", "Number", "Boolean", "Array", "Object", "Math",
            "JSON", "console", "window", "document", "fetch", "Promise", "Date", "Error", "event",
            "e", "r", "s", "i", "t", "n", "ok", "data", "error", "index",
        ]
        .iter()
        .copied()
        .collect();

        // Strip string literals before extracting identifiers
        let stripped = strip_strings(expr);
        let re = regex::Regex::new(r"\b[a-zA-Z_]\w*\b").unwrap();
        // Collect matches first to avoid borrow issues with self
        let matches: Vec<String> = re.find_iter(&stripped).map(|m| m.as_str().to_string()).collect();
        for id in &matches {
            if reserved.contains(id.as_str()) || self.type_aliases.contains_key(id.as_str()) {
                continue;
            }
            if !self.symbols.contains_key(id.as_str()) {
                let sug = self.similar(id);
                self.diags.push(Diagnostic {
                    level: DiagLevel::Error,
                    code: "E0301".into(),
                    message: format!("未定義の識別子 '{}'", id),
                    span: None,
                    hint: sug.map(|s| format!("'{}' のことですか？", s)),
                });
            }
        }
    }

    fn check_unused(&mut self) {
        let mut used: HashSet<String> = HashSet::new();
        self.collect_refs(&self.component.template.clone(), &mut used);

        for d in &self.component.script {
            match d {
                Decl::Computed { expr, .. } => {
                    let re = regex::Regex::new(r"\b\w+\b").unwrap();
                    for m in re.find_iter(expr) {
                        used.insert(m.as_str().to_string());
                    }
                }
                Decl::Fn { body, .. } => {
                    let re = regex::Regex::new(r"\b\w+\b").unwrap();
                    for m in re.find_iter(body) {
                        used.insert(m.as_str().to_string());
                    }
                }
                Decl::Watch { deps, body, .. } => {
                    for dep in deps {
                        used.insert(dep.clone());
                    }
                    let re = regex::Regex::new(r"\b\w+\b").unwrap();
                    for m in re.find_iter(body) {
                        used.insert(m.as_str().to_string());
                    }
                }
                _ => {}
            }
        }

        for d in &self.component.script {
            if let Decl::State { name, span, .. } = d {
                if !used.contains(name.as_str()) {
                    self.diags.push(Diagnostic {
                        level: DiagLevel::Warning,
                        code: "W0101".into(),
                        message: format!("state '{}' が宣言されましたが使用されていません", name),
                        span: Some(span.clone()),
                        hint: None,
                    });
                }
            }
        }
    }

    fn collect_refs(&self, nodes: &[TemplateNode], refs: &mut HashSet<String>) {
        let re = regex::Regex::new(r"\b\w+\b").unwrap();
        for n in nodes {
            match n {
                TemplateNode::Interpolation { expr } => {
                    for m in re.find_iter(expr) {
                        refs.insert(m.as_str().to_string());
                    }
                }
                TemplateNode::Element {
                    attrs, children, ..
                } => {
                    for a in attrs {
                        if a.dynamic || a.event || a.bind {
                            for m in re.find_iter(&a.value) {
                                refs.insert(m.as_str().to_string());
                            }
                        }
                    }
                    self.collect_refs(children, refs);
                }
                TemplateNode::If {
                    condition,
                    children,
                    else_if_chain,
                    else_children,
                } => {
                    for m in re.find_iter(condition) {
                        refs.insert(m.as_str().to_string());
                    }
                    self.collect_refs(children, refs);
                    if let Some(chain) = else_if_chain {
                        for branch in chain {
                            for m in re.find_iter(&branch.condition) {
                                refs.insert(m.as_str().to_string());
                            }
                            self.collect_refs(&branch.children, refs);
                        }
                    }
                    if let Some(ec) = else_children {
                        self.collect_refs(ec, refs);
                    }
                }
                TemplateNode::For {
                    of,
                    children,
                    empty_children,
                    ..
                } => {
                    for m in re.find_iter(of) {
                        refs.insert(m.as_str().to_string());
                    }
                    self.collect_refs(children, refs);
                    if let Some(ec) = empty_children {
                        self.collect_refs(ec, refs);
                    }
                }
                TemplateNode::Text { .. } => {}
            }
        }
    }

    fn infer(&self, expr: &str) -> Option<ChasketType> {
        let e = expr.trim();
        if regex::Regex::new(r"^-?\d+(\.\d+)?$").unwrap().is_match(e) {
            return Some(ChasketType::Primitive {
                name: "number".into(),
            });
        }
        if e.starts_with('"') || e.starts_with('\'') || e.starts_with('`') {
            return Some(ChasketType::Primitive {
                name: "string".into(),
            });
        }
        if e == "true" || e == "false" {
            return Some(ChasketType::Primitive {
                name: "boolean".into(),
            });
        }
        if e == "null" {
            return Some(ChasketType::Primitive {
                name: "null".into(),
            });
        }
        if e.starts_with('[') {
            return Some(ChasketType::Array {
                element: Box::new(ChasketType::Primitive {
                    name: "string".into(),
                }),
            });
        }
        if let Some(sym) = self.symbols.get(e) {
            return Some(sym.type_ann.clone());
        }
        None
    }

    fn assignable(&self, from: &ChasketType, to: &ChasketType) -> bool {
        match (from, to) {
            (ChasketType::Primitive { name: a }, ChasketType::Primitive { name: b }) => a == b,
            (ChasketType::Array { .. }, ChasketType::Array { .. }) => true,
            _ => true,
        }
    }

    fn similar(&self, name: &str) -> Option<String> {
        let mut best: Option<String> = None;
        let mut best_dist = usize::MAX;
        for k in self.symbols.keys() {
            let d = levenshtein(name, k);
            if d < best_dist && d <= 2 {
                best_dist = d;
                best = Some(k.clone());
            }
        }
        best
    }
}

fn strip_strings(expr: &str) -> String {
    let re_dq = regex::Regex::new(r#""(?:[^"\\]|\\.)*""#).unwrap();
    let re_sq = regex::Regex::new(r"'(?:[^'\\]|\\.)*'").unwrap();
    let re_bt = regex::Regex::new(r"`(?:[^`\\]|\\.)*`").unwrap();
    let s = re_dq.replace_all(expr, " ");
    let s = re_sq.replace_all(&s, " ");
    let s = re_bt.replace_all(&s, " ");
    s.to_string()
}

fn levenshtein(a: &str, b: &str) -> usize {
    let m = a.len();
    let n = b.len();
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_bytes[i - 1] == b_bytes[j - 1] {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }
    dp[m][n]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein() {
        assert_eq!(levenshtein("count", "count"), 0);
        assert_eq!(levenshtein("count", "cont"), 1);
        assert_eq!(levenshtein("hello", "world"), 4);
    }

    #[test]
    fn test_strip_strings() {
        assert_eq!(strip_strings(r#""hello" + world"#).trim(), "+ world");
    }
}
