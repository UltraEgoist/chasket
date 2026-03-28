use regex::Regex;

use crate::ast::*;
use crate::types::parse_type;

// ─── Phase 2: Meta Parser ───

pub fn parse_meta(content: &str) -> Meta {
    let mut meta = Meta::default();
    for line in content.lines().map(|l| l.trim()).filter(|l| !l.is_empty() && !l.starts_with("//"))
    {
        let re = Regex::new(r"^(\w+)\s*:\s*(.+)$").unwrap();
        if let Some(m) = re.captures(line) {
            let key = &m[1];
            let val = m[2].trim().trim_matches(|c| c == '"' || c == '\'');
            match key {
                "name" => meta.name = Some(val.to_string()),
                "shadow" => meta.shadow = Some(val.to_string()),
                "form" => meta.form = val == "true",
                "extends" => meta.extends = Some(val.to_string()),
                _ => {}
            }
        }
    }
    meta
}

// ─── Phase 2: Script Parser ───

pub fn parse_script(content: &str, start_line: usize) -> Vec<Decl> {
    let mut decls = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        let ln = start_line + i;

        if line.is_empty() || line.starts_with("//") {
            i += 1;
            continue;
        }

        // import
        let re_import = Regex::new(
            r#"^import\s+(?:(\w+)\s+from\s+|(?:\{([^}]+)\})\s+from\s+)["']([^"']+)["']"#,
        )
        .unwrap();
        if let Some(m) = re_import.captures(line) {
            decls.push(Decl::Import {
                default_import: m.get(1).map(|v| v.as_str().to_string()),
                named_imports: m
                    .get(2)
                    .map(|v| v.as_str().split(',').map(|s| s.trim().to_string()).collect()),
                from: m[3].to_string(),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // type alias
        let re_type = Regex::new(r"^type\s+(\w+)\s*=\s*(.+)$").unwrap();
        if let Some(m) = re_type.captures(line) {
            decls.push(Decl::Type {
                name: m[1].to_string(),
                type_def: parse_type(&m[2]),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // state
        let re_state = Regex::new(r"^state\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$").unwrap();
        if let Some(m) = re_state.captures(line) {
            decls.push(Decl::State {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                init: m[3].trim().to_string(),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // prop
        let re_prop = Regex::new(r"^prop\s+(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$").unwrap();
        if let Some(m) = re_prop.captures(line) {
            decls.push(Decl::Prop {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                default: m.get(3).map(|v| v.as_str().trim().to_string()),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // computed
        let re_computed = Regex::new(r"^computed\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$").unwrap();
        if let Some(m) = re_computed.captures(line) {
            decls.push(Decl::Computed {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                expr: m[3].trim().to_string(),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // emit
        let re_emit = Regex::new(r"^emit(?:\(([^)]*)\))?\s+(\w+)\s*:\s*(.+)$").unwrap();
        if let Some(m) = re_emit.captures(line) {
            let raw_opts = m.get(1).map_or("", |v| v.as_str());
            let opts: Vec<&str> = if raw_opts.is_empty() {
                Vec::new()
            } else {
                raw_opts.split(',').map(|s| s.trim()).collect()
            };
            let emit_opts = if opts.iter().any(|o| o.eq_ignore_ascii_case("local")) {
                EmitOptions {
                    bubbles: false,
                    composed: false,
                }
            } else {
                EmitOptions {
                    bubbles: opts.is_empty() || opts.iter().any(|o| o.eq_ignore_ascii_case("bubbles")),
                    composed: opts.is_empty()
                        || opts.iter().any(|o| o.eq_ignore_ascii_case("composed")),
                }
            };
            decls.push(Decl::Emit {
                name: m[2].to_string(),
                type_ann: parse_type(m[3].trim()),
                options: emit_opts,
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // ref
        let re_ref = Regex::new(r"^ref\s+(\w+)\s*:\s*(.+)$").unwrap();
        if let Some(m) = re_ref.captures(line) {
            decls.push(Decl::Ref {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // fn
        let re_fn =
            Regex::new(r"^fn\s+(async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?\s*\{").unwrap();
        if let Some(m) = re_fn.captures(line) {
            let params = parse_fn_params(m.get(3).map_or("", |v| v.as_str()));
            let (body, new_i) = collect_brace_body(&lines, i + 1);
            decls.push(Decl::Fn {
                name: m[2].to_string(),
                is_async: m.get(1).is_some(),
                params,
                return_type: m.get(4).map(|v| parse_type(v.as_str())),
                body,
                span: Span { line: ln },
            });
            i = new_i;
            continue;
        }

        // lifecycle: on mount|unmount|adopt
        let re_lc = Regex::new(r"^on\s+(mount|unmount|adopt)\s*\{").unwrap();
        if let Some(m) = re_lc.captures(line) {
            let event = match &m[1] {
                "mount" => LifecycleEvent::Mount,
                "unmount" => LifecycleEvent::Unmount,
                "adopt" => LifecycleEvent::Adopt,
                _ => unreachable!(),
            };
            let (body, new_i) = collect_brace_body(&lines, i + 1);
            decls.push(Decl::Lifecycle {
                event,
                body,
                span: Span { line: ln },
            });
            i = new_i;
            continue;
        }

        // watch
        let re_watch = Regex::new(r"^watch\s*\(([^)]+)\)\s*\{").unwrap();
        if let Some(m) = re_watch.captures(line) {
            let deps: Vec<String> = m[1].split(',').map(|d| d.trim().to_string()).collect();
            let (body, new_i) = collect_brace_body(&lines, i + 1);
            decls.push(Decl::Watch {
                deps,
                body,
                span: Span { line: ln },
            });
            i = new_i;
            continue;
        }

        // provide
        let re_provide = Regex::new(r"^provide\s+(\w+)\s*:\s*([^=]+)\s*=\s*(.+)$").unwrap();
        if let Some(m) = re_provide.captures(line) {
            decls.push(Decl::Provide {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                init: m[3].trim().to_string(),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        // consume
        let re_consume = Regex::new(r"^consume\s+(\w+)\s*:\s*(.+)$").unwrap();
        if let Some(m) = re_consume.captures(line) {
            decls.push(Decl::Consume {
                name: m[1].to_string(),
                type_ann: parse_type(m[2].trim()),
                span: Span { line: ln },
            });
            i += 1;
            continue;
        }

        i += 1;
    }

    decls
}

fn parse_fn_params(s: &str) -> Vec<FnParam> {
    let s = s.trim();
    if s.is_empty() {
        return Vec::new();
    }
    let mut params = Vec::new();
    for p in s.split(',') {
        let p = p.trim();
        let re = Regex::new(r"^(\w+)\s*:\s*(.+)$").unwrap();
        if let Some(m) = re.captures(p) {
            params.push(FnParam {
                name: m[1].to_string(),
                type_ann: parse_type(&m[2]),
            });
        }
    }
    params
}

fn collect_brace_body(lines: &[&str], start: usize) -> (String, usize) {
    let mut body = String::new();
    let mut bc = 1i32;
    let mut i = start;
    while i < lines.len() && bc > 0 {
        let l = lines[i];
        bc += l.matches('{').count() as i32;
        bc -= l.matches('}').count() as i32;
        if bc > 0 {
            if !body.is_empty() {
                body.push('\n');
            }
            body.push_str(l);
        }
        i += 1;
    }
    (body.trim().to_string(), i)
}

// ─── Phase 2: Template Parser ───

pub fn parse_template_nodes(html: &str) -> Vec<TemplateNode> {
    let mut nodes = Vec::new();
    let mut pos = 0;
    let bytes = html.as_bytes();

    while pos < html.len() {
        // Interpolation
        if html[pos..].starts_with("{{") {
            if let Some(end) = html[pos + 2..].find("}}") {
                let expr = html[pos + 2..pos + 2 + end].trim().to_string();
                nodes.push(TemplateNode::Interpolation { expr });
                pos = pos + 2 + end + 2;
                continue;
            }
        }

        // #if block
        if html[pos..].starts_with("<#if") {
            let (node, end) = parse_if_block(html, pos);
            nodes.push(node);
            pos = end;
            continue;
        }

        // #for block
        if html[pos..].starts_with("<#for") {
            let (node, end) = parse_for_block(html, pos);
            nodes.push(node);
            pos = end;
            continue;
        }

        // Element (not close tag, not directive)
        if pos < bytes.len()
            && bytes[pos] == b'<'
            && (pos + 1 < bytes.len() && bytes[pos + 1] != b'/')
            && !html[pos..].starts_with("<:")
            && !html[pos..].starts_with("<#")
        {
            if let Some((node, end)) = parse_element(html, pos) {
                nodes.push(node);
                pos = end;
                continue;
            }
        }

        // Text
        let next = find_next(html, pos);
        let text = &html[pos..next];
        if !text.trim().is_empty() {
            nodes.push(TemplateNode::Text {
                value: text.to_string(),
            });
        }
        pos = next;
    }

    nodes
}

fn find_next(html: &str, pos: usize) -> usize {
    let mut min = html.len();
    for marker in &["{{", "<#if", "<#for", "<"] {
        if let Some(i) = html[pos + 1..].find(marker) {
            let abs = pos + 1 + i;
            if abs < min {
                min = abs;
            }
        }
    }
    min
}

fn parse_element(html: &str, pos: usize) -> Option<(TemplateNode, usize)> {
    let re = Regex::new(r"^<([a-zA-Z][\w-]*)((?:\s+[^>]*?)??)(\s*/?)>").unwrap();
    let m = re.captures(&html[pos..])?;

    let tag = m[1].to_string();
    let attrs_str = m.get(2).map_or("", |v| v.as_str());
    let self_close = m[3].contains('/');
    let tag_end = pos + m[0].len();
    let attrs = parse_attrs(attrs_str);

    if self_close {
        return Some((
            TemplateNode::Element {
                tag,
                attrs,
                children: Vec::new(),
                self_closing: true,
            },
            tag_end,
        ));
    }

    let close_tag = format!("</{}>", tag);
    let open_tag = format!("<{}", tag);
    let mut depth = 1i32;
    let mut sp = tag_end;

    while depth > 0 && sp < html.len() {
        let next_open = html[sp..].find(&open_tag).map(|i| sp + i);
        let next_close = html[sp..].find(&close_tag).map(|i| sp + i);

        match (next_open, next_close) {
            (_, None) => break,
            (Some(no), Some(nc)) if no < nc => {
                // Check if it's a self-closing tag
                if let Some(gt) = html[no..].find('>') {
                    let gt_pos = no + gt;
                    if gt_pos > 0 && html.as_bytes()[gt_pos - 1] != b'/' {
                        depth += 1;
                    }
                    sp = gt_pos + 1;
                } else {
                    sp = no + open_tag.len();
                }
            }
            (_, Some(nc)) => {
                depth -= 1;
                if depth == 0 {
                    let children = parse_template_nodes(&html[tag_end..nc]);
                    return Some((
                        TemplateNode::Element {
                            tag,
                            attrs,
                            children,
                            self_closing: false,
                        },
                        nc + close_tag.len(),
                    ));
                }
                sp = nc + close_tag.len();
            }
        }
    }

    // Fallback: treat as self-closing
    Some((
        TemplateNode::Element {
            tag,
            attrs,
            children: Vec::new(),
            self_closing: true,
        },
        tag_end,
    ))
}

fn parse_attrs(s: &str) -> Vec<Attr> {
    let re = Regex::new(r#"([:@]?[\w\-\.]+(?:\|[\w]+)*)(?:\s*=\s*"([^"]*)")?"#).unwrap();
    let mut attrs = Vec::new();

    for m in re.captures_iter(s) {
        let mut name = m[1].to_string();
        let value = m.get(2).map_or("", |v| v.as_str()).to_string();
        let mut dynamic = false;
        let mut event = false;
        let mut bind = false;
        let mut is_ref = false;
        let mut html_raw = false;
        let mut spread = false;

        // Split off modifiers (e.g. @click|prevent|stop)
        let parts: Vec<&str> = name.split('|').collect();
        let modifiers: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
        name = parts[0].to_string();

        if name == ":bind" {
            bind = true;
            name = "bind".into();
        } else if name.starts_with(":...") {
            spread = true;
            name = name[4..].to_string();
        } else if name.starts_with(':') {
            dynamic = true;
            name = name[1..].to_string();
        } else if name == "@html" {
            html_raw = true;
            name = "html".into();
        } else if name.starts_with('@') {
            event = true;
            name = name[1..].to_string();
        } else if name == "ref" {
            is_ref = true;
        }

        attrs.push(Attr {
            name,
            value,
            dynamic,
            event,
            bind,
            is_ref,
            modifiers,
            html: html_raw,
            spread,
        });
    }

    attrs
}

fn find_matching_close(html: &str, start: usize, block_tag: &str) -> usize {
    let open = format!("<{}", block_tag);
    let close = format!("</{}>", block_tag);
    let mut depth = 1i32;
    let mut p = start;

    while depth > 0 && p < html.len() {
        let next_open = html[p..].find(&open).map(|i| p + i);
        let next_close = html[p..].find(&close).map(|i| p + i);

        match (next_open, next_close) {
            (_, None) => return html.len(),
            (Some(no), Some(nc)) if no < nc => {
                depth += 1;
                p = no + open.len();
            }
            (_, Some(nc)) => {
                depth -= 1;
                if depth == 0 {
                    return nc;
                }
                p = nc + close.len();
            }
        }
    }
    html.len()
}

fn parse_if_block(html: &str, pos: usize) -> (TemplateNode, usize) {
    let re = Regex::new(r#"<#if\s+condition="([^"]+)">"#).unwrap();
    let m = re.captures(&html[pos..]).expect("Invalid #if");
    let condition = m[1].to_string();
    let sp = pos + m[0].len();
    let cp = find_matching_close(html, sp, "#if");
    let inner = &html[sp..cp];

    let mut else_if_chain: Vec<ElseIfBranch> = Vec::new();
    let mut else_children: Option<Vec<TemplateNode>> = None;

    // Find first :else-if or :else
    let re_branch = Regex::new(r#"<:else-if\s+condition="([^"]+)">|<:else>"#).unwrap();
    let main_content;
    let mut remaining;

    if let Some(branch_match) = re_branch.find(inner) {
        main_content = inner[..branch_match.start()].to_string();
        remaining = inner[branch_match.start()..].to_string();

        while !remaining.is_empty() {
            let re_eif = Regex::new(r#"^<:else-if\s+condition="([^"]+)">"#).unwrap();
            if let Some(eif) = re_eif.captures(&remaining) {
                let branch_cond = eif[1].to_string();
                remaining = remaining[eif[0].len()..].to_string();

                let next = re_branch.find(&remaining);
                let branch_content;
                if let Some(nm) = next {
                    branch_content = remaining[..nm.start()].to_string();
                    remaining = remaining[nm.start()..].to_string();
                } else {
                    branch_content = remaining.clone();
                    remaining = String::new();
                }
                else_if_chain.push(ElseIfBranch {
                    condition: branch_cond,
                    children: parse_template_nodes(branch_content.trim()),
                });
                continue;
            }

            if remaining.starts_with("<:else>") {
                else_children =
                    Some(parse_template_nodes(remaining["<:else>".len()..].trim()));
                break;
            }
            break;
        }
    } else {
        main_content = inner.to_string();
    }

    let node = TemplateNode::If {
        condition,
        children: parse_template_nodes(main_content.trim()),
        else_if_chain: if else_if_chain.is_empty() {
            None
        } else {
            Some(else_if_chain)
        },
        else_children,
    };
    (node, cp + "</#if>".len())
}

fn parse_for_block(html: &str, pos: usize) -> (TemplateNode, usize) {
    let tag_re = Regex::new(r"<#for\s+((?:[^>])+)>").unwrap();
    let tag_m = tag_re.captures(&html[pos..]).expect("Invalid #for");
    let attr_str = &tag_m[1];

    let each_re = Regex::new(r#"each="([^"]+)""#).unwrap();
    let of_re = Regex::new(r#"of="([^"]+)""#).unwrap();
    let key_re = Regex::new(r#"key="([^"]+)""#).unwrap();

    let each_val = each_re
        .captures(attr_str)
        .expect("Missing 'each' attribute in #for")[1]
        .to_string();
    let of_val = of_re
        .captures(attr_str)
        .expect("Missing 'of' attribute in #for")[1]
        .to_string();
    let key_val = key_re
        .captures(attr_str)
        .expect("Missing 'key' attribute in #for")[1]
        .to_string();

    // Parse "each" which may be "item, index"
    let each_parts: Vec<&str> = each_val.split(',').map(|s| s.trim()).collect();
    let each = each_parts[0].to_string();
    let index = if each_parts.len() > 1 {
        Some(each_parts[1].to_string())
    } else {
        None
    };

    let sp = pos + tag_m[0].len();
    let cp = find_matching_close(html, sp, "#for");
    let mut inner = html[sp..cp].to_string();

    // :empty block
    let re_empty = Regex::new(r"(?s)<:empty>(.*?)</:empty>").unwrap();
    let empty_children = if let Some(em) = re_empty.captures(&inner) {
        let empty_html = em[1].to_string();
        inner = re_empty.replace(&inner, "").to_string();
        Some(parse_template_nodes(empty_html.trim()))
    } else {
        None
    };

    let node = TemplateNode::For {
        each,
        index,
        of: of_val,
        key: key_val,
        children: parse_template_nodes(&inner),
        empty_children,
    };
    (node, cp + "</#for>".len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_meta() {
        let m = parse_meta("  name: \"x-hello\"\n  shadow: open\n  form: true\n");
        assert_eq!(m.name, Some("x-hello".to_string()));
        assert_eq!(m.shadow, Some("open".to_string()));
        assert!(m.form);
    }

    #[test]
    fn test_parse_script_state() {
        let decls = parse_script("  state count: number = 0\n", 1);
        assert_eq!(decls.len(), 1);
        match &decls[0] {
            Decl::State { name, init, .. } => {
                assert_eq!(name, "count");
                assert_eq!(init, "0");
            }
            _ => panic!("Expected state decl"),
        }
    }

    #[test]
    fn test_parse_template_basic() {
        let nodes = parse_template_nodes("<div>hello {{ name }}</div>");
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::Element { tag, children, .. } => {
                assert_eq!(tag, "div");
                assert_eq!(children.len(), 2);
            }
            _ => panic!("Expected element"),
        }
    }

    #[test]
    fn test_parse_for_any_order() {
        let nodes = parse_template_nodes(
            r#"<#for of="items" each="item" key="item"><div>{{ item }}</div></#for>"#,
        );
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::For { each, of, key, .. } => {
                assert_eq!(each, "item");
                assert_eq!(of, "items");
                assert_eq!(key, "item");
            }
            _ => panic!("Expected for node"),
        }
    }
}
