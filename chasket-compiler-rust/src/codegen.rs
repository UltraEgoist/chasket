use regex::Regex;

use crate::ast::*;
use crate::types::type_to_ts;
use crate::{CompileOptions, CompileTarget};

/// Event binding info collected during template generation
struct EventBinding {
    eid: String,
    events: Vec<Attr>,
    binds: Vec<Attr>,
    in_loop: bool,
    loop_ctx: Option<LoopCtx>,
}

#[derive(Clone)]
struct LoopCtx {
    each: String,
    index: String,
    of: String,
}

/// Phase 4: Code Generator
pub fn generate(c: &Component, options: &CompileOptions) -> String {
    let ts = options.target == CompileTarget::Ts;

    // Collect declaration names by kind
    let mut sv: Vec<String> = Vec::new(); // state vars
    let mut pv: Vec<String> = Vec::new(); // prop vars
    let mut cv: Vec<String> = Vec::new(); // computed vars
    let mut en: Vec<String> = Vec::new(); // emit names
    let mut rn: Vec<String> = Vec::new(); // ref names
    let mut fns: Vec<String> = Vec::new(); // fn names
    let mut prov: Vec<String> = Vec::new(); // provide
    let mut cons: Vec<String> = Vec::new(); // consume

    for d in &c.script {
        match d {
            Decl::State { name, .. } => sv.push(name.clone()),
            Decl::Prop { name, .. } => pv.push(name.clone()),
            Decl::Computed { name, .. } => cv.push(name.clone()),
            Decl::Emit { name, .. } => en.push(name.clone()),
            Decl::Ref { name, .. } => rn.push(name.clone()),
            Decl::Fn { name, .. } => fns.push(name.clone()),
            Decl::Provide { name, .. } => {
                prov.push(name.clone());
                sv.push(name.clone());
            }
            Decl::Consume { name, .. } => cons.push(name.clone()),
            _ => {}
        }
    }

    let mut eid_counter: usize = 0;
    let mut event_bindings: Vec<EventBinding> = Vec::new();

    let tn = c.meta.name.clone().unwrap_or_else(|| "x-component".into());
    let cn = tag_to_class(&tn);
    let sh = c.meta.shadow.clone().unwrap_or_else(|| "open".into());
    let use_shadow = sh != "none";
    let root = if use_shadow {
        "this.#shadow"
    } else {
        "this"
    };

    // Build template string (populates event_bindings)
    let template_str = tpl_str(
        &c.template,
        6,
        None,
        &sv,
        &pv,
        &cv,
        &en,
        &fns,
        &rn,
        &cons,
        &mut eid_counter,
        &mut event_bindings,
    );

    let mut o = String::new();
    o.push_str("(() => {\n\"use strict\";\n\n");
    o.push_str(&format!("class {} extends HTMLElement {{\n", cn));

    // Field declarations
    for d in &c.script {
        if let Decl::State {
            name,
            type_ann,
            init,
            ..
        } = d
        {
            let ts_ann = if ts {
                format!(": {}", type_to_ts(type_ann))
            } else {
                String::new()
            };
            o.push_str(&format!("  #{}{} = {};\n", name, ts_ann, init));
        }
    }
    for d in &c.script {
        if let Decl::Provide {
            name,
            type_ann,
            init,
            ..
        } = d
        {
            let ts_ann = if ts {
                format!(": {}", type_to_ts(type_ann))
            } else {
                String::new()
            };
            o.push_str(&format!("  #{}{} = {};\n", name, ts_ann, init));
        }
    }
    for d in &c.script {
        if let Decl::Consume {
            name, type_ann, ..
        } = d
        {
            let ts_ann = if ts {
                format!(": {} | undefined", type_to_ts(type_ann))
            } else {
                String::new()
            };
            o.push_str(&format!("  #{}{} = undefined;\n", name, ts_ann));
        }
    }
    for d in &c.script {
        if let Decl::Ref {
            name, type_ann, ..
        } = d
        {
            let ts_ann = if ts {
                format!(": {} | null", type_to_ts(type_ann))
            } else {
                String::new()
            };
            o.push_str(&format!("  #{}{} = null;\n", name, ts_ann));
        }
    }

    if use_shadow {
        let ts_ann = if ts { ": ShadowRoot" } else { "" };
        o.push_str(&format!("  #shadow{};\n", ts_ann));
    }
    let ts_ann = if ts {
        ": [Element, string, EventListener][]"
    } else {
        ""
    };
    o.push_str(&format!("  #listeners{} = [];\n\n", ts_ann));

    // observedAttributes
    if !pv.is_empty() {
        let attrs: Vec<String> = pv.iter().map(|p| format!("'{}'", camel_to_kebab(p))).collect();
        o.push_str(&format!(
            "  static get observedAttributes() {{\n    return [{}];\n  }}\n\n",
            attrs.join(", ")
        ));
    }

    // constructor
    o.push_str("  constructor() {\n    super();\n");
    if use_shadow {
        o.push_str(&format!(
            "    this.#shadow = this.attachShadow({{ mode: '{}' }});\n",
            sh
        ));
    }
    o.push_str("  }\n\n");

    // connectedCallback
    o.push_str("  connectedCallback() {\n");
    // Read initial prop values
    for d in &c.script {
        if let Decl::Prop {
            name,
            type_ann,
            default,
            ..
        } = d
        {
            let kebab = camel_to_kebab(name);
            let coerce = match type_name(type_ann) {
                "number" => "parseFloat(v) || 0".to_string(),
                "boolean" => "v !== null && v !== 'false'".to_string(),
                _ => format!("v || {}", default.as_deref().unwrap_or("''")),
            };
            o.push_str(&format!(
                "    {{ const v = this.getAttribute('{}'); if (v !== null) this.#prop_{} = {}; }}\n",
                kebab, name, coerce
            ));
        }
    }
    // provide listeners
    for d in &c.script {
        if let Decl::Provide { name, .. } = d {
            o.push_str(&format!(
                "    this.addEventListener('__chasket_ctx_{}', (e) => {{ e.stopPropagation(); e.detail.value = this.#{}; e.detail.provider = this; }});\n",
                name, name
            ));
        }
    }
    // consume dispatch
    for d in &c.script {
        if let Decl::Consume { name, .. } = d {
            o.push_str(&format!(
                "    {{ const detail = {{ value: undefined, provider: null }};\n      this.dispatchEvent(new CustomEvent('__chasket_ctx_{}', {{ detail, bubbles: true, composed: true }}));\n      if (detail.provider) this.#{} = detail.value; }}\n",
                name, name
            ));
        }
    }
    o.push_str("    this.#render();\n    this.#bindEvents();\n    this.#bindRefs();\n");
    // mount lifecycle
    for d in &c.script {
        if let Decl::Lifecycle { event, body, .. } = d {
            if *event == LifecycleEvent::Mount {
                let transformed = tx(body, &sv, &pv, &cv, &en, &fns, &rn, &cons);
                o.push_str(&format!(
                    "    {}\n",
                    transformed.replace('\n', "\n    ")
                ));
            }
        }
    }
    o.push_str("  }\n\n");

    // disconnectedCallback
    o.push_str(
        "  disconnectedCallback() {\n    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));\n    this.#listeners = [];\n",
    );
    for d in &c.script {
        if let Decl::Lifecycle { event, body, .. } = d {
            if *event == LifecycleEvent::Unmount {
                let transformed = tx(body, &sv, &pv, &cv, &en, &fns, &rn, &cons);
                o.push_str(&format!(
                    "    {}\n",
                    transformed.replace('\n', "\n    ")
                ));
            }
        }
    }
    o.push_str("  }\n\n");

    // adoptedCallback
    let adopt_hooks: Vec<&Decl> = c
        .script
        .iter()
        .filter(|d| matches!(d, Decl::Lifecycle { event, .. } if *event == LifecycleEvent::Adopt))
        .collect();
    if !adopt_hooks.is_empty() {
        o.push_str("  adoptedCallback() {\n");
        for d in adopt_hooks {
            if let Decl::Lifecycle { body, .. } = d {
                let transformed = tx(body, &sv, &pv, &cv, &en, &fns, &rn, &cons);
                o.push_str(&format!(
                    "    {}\n",
                    transformed.replace('\n', "\n    ")
                ));
            }
        }
        o.push_str("  }\n\n");
    }

    // attributeChangedCallback
    if !pv.is_empty() {
        o.push_str(
            "  attributeChangedCallback(name, oldVal, newVal) {\n    if (oldVal === newVal) return;\n",
        );
        for d in &c.script {
            if let Decl::Prop {
                name, type_ann, ..
            } = d
            {
                let kebab = camel_to_kebab(name);
                let coerce = match type_name(type_ann) {
                    "number" => "parseFloat(newVal) || 0",
                    "boolean" => "newVal !== null && newVal !== 'false'",
                    _ => "newVal || ''",
                };
                o.push_str(&format!(
                    "    if (name === '{}') {{ this.#prop_{} = {}; this.#update(); }}\n",
                    kebab, name, coerce
                ));
            }
        }
        o.push_str("  }\n\n");
    }

    // Prop getters
    for d in &c.script {
        if let Decl::Prop {
            name,
            type_ann,
            default,
            ..
        } = d
        {
            let def_val = default.as_deref().unwrap_or_else(|| match type_name(type_ann) {
                "number" => "0",
                "boolean" => "false",
                _ => "''",
            });
            let ts_type = if ts {
                format!(": {}", type_to_ts(type_ann))
            } else {
                String::new()
            };
            o.push_str(&format!(
                "  #prop_{}{} = {};\n  get {}(){} {{ return this.#prop_{}; }}\n\n",
                name, ts_type, def_val, name, ts_type, name
            ));
        }
    }

    // Computed getters
    for d in &c.script {
        if let Decl::Computed {
            name,
            type_ann,
            expr,
            ..
        } = d
        {
            let ts_type = if ts {
                format!(": {}", type_to_ts(type_ann))
            } else {
                String::new()
            };
            let transformed = tx(expr, &sv, &pv, &cv, &en, &fns, &rn, &cons);
            o.push_str(&format!(
                "  get #{}(){} {{ return {}; }}\n\n",
                name, ts_type, transformed
            ));
        }
    }

    // Emit methods
    for d in &c.script {
        if let Decl::Emit {
            name,
            type_ann,
            options,
            ..
        } = d
        {
            let detail_type = if ts {
                format!(": {}", type_to_ts(type_ann))
            } else {
                String::new()
            };
            let ret_type = if ts { ": void" } else { "" };
            o.push_str(&format!(
                "  #emit_{}(detail{}){} {{\n    this.dispatchEvent(new CustomEvent('{}', {{ detail, bubbles: {}, composed: {} }}));\n  }}\n\n",
                name, detail_type, ret_type, name, options.bubbles, options.composed
            ));
        }
    }

    // Functions
    for d in &c.script {
        if let Decl::Fn {
            name,
            is_async,
            params,
            return_type,
            body,
            ..
        } = d
        {
            let ak = if *is_async { "async " } else { "" };
            let ps: Vec<String> = params
                .iter()
                .map(|p| {
                    if ts {
                        format!("{}: {}", p.name, type_to_ts(&p.type_ann))
                    } else {
                        p.name.clone()
                    }
                })
                .collect();
            let ret_type = if ts {
                return_type
                    .as_ref()
                    .map(|t| format!(": {}", type_to_ts(t)))
                    .unwrap_or_default()
            } else {
                String::new()
            };
            let transformed = tx(body, &sv, &pv, &cv, &en, &fns, &rn, &cons);
            o.push_str(&format!(
                "  {}#{}({}){} {{\n    {}\n  }}\n\n",
                ak,
                name,
                ps.join(", "),
                ret_type,
                transformed.replace('\n', "\n    ")
            ));
        }
    }

    // Watch methods
    for d in &c.script {
        if let Decl::Watch { deps, body, .. } = d {
            let transformed = tx(body, &sv, &pv, &cv, &en, &fns, &rn, &cons);
            o.push_str(&format!(
                "  #watch_{}() {{\n    {}\n  }}\n\n",
                deps.join("_"),
                transformed.replace('\n', "\n    ")
            ));
        }
    }

    // Previous value fields for watch deps
    let watch_decls: Vec<&Decl> = c
        .script
        .iter()
        .filter(|d| matches!(d, Decl::Watch { .. }))
        .collect();
    if !watch_decls.is_empty() {
        let mut all_watched: Vec<String> = Vec::new();
        for d in &watch_decls {
            if let Decl::Watch { deps, .. } = d {
                for dep in deps {
                    if !all_watched.contains(dep) {
                        all_watched.push(dep.clone());
                    }
                }
            }
        }
        for dep in &all_watched {
            if let Some(state_decl) = c
                .script
                .iter()
                .find(|d| matches!(d, Decl::State { name, .. } if name == dep))
            {
                if let Decl::State { init, .. } = state_decl {
                    o.push_str(&format!("  #__prev_{} = {};\n", dep, init));
                }
            }
        }
        o.push('\n');
    }

    // #render
    o.push_str("  #render() {\n");
    o.push_str("    const tpl = document.createElement('template');\n");
    o.push_str("    tpl.innerHTML = `\n");
    if let Some(style) = &c.style {
        o.push_str(&format!("      <style>{}</style>\n", min_css(style)));
    }
    o.push_str(&template_str);
    o.push_str("    `;\n");
    o.push_str(&format!(
        "    {}.replaceChildren(tpl.content.cloneNode(true));\n",
        root
    ));
    o.push_str("  }\n\n");

    // #bindEvents
    o.push_str("  #bindEvents() {\n");
    o.push_str(&build_evt_code(
        root,
        &event_bindings,
        &sv,
        &pv,
        &cv,
        &en,
        &fns,
        &rn,
        &cons,
    ));
    o.push_str("  }\n\n");

    // #bindRefs
    o.push_str("  #bindRefs() {\n");
    for d in &c.script {
        if let Decl::Ref { name, .. } = d {
            o.push_str(&format!(
                "    this.#{} = {}.querySelector('[data-ref=\"{}\"]');\n",
                name, root, name
            ));
        }
    }
    o.push_str("  }\n\n");

    // #update
    o.push_str("  #update() {\n");
    o.push_str(
        "    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));\n",
    );
    o.push_str("    this.#listeners = [];\n");
    // Watch dep checks
    for d in &c.script {
        if let Decl::Watch { deps, .. } = d {
            let dep_checks: Vec<String> = deps
                .iter()
                .map(|dep| format!("this.#{} !== this.#__prev_{}", dep, dep))
                .collect();
            o.push_str(&format!(
                "    const __watchFire_{} = {};\n",
                deps.join("_"),
                dep_checks.join(" || ")
            ));
        }
    }
    o.push_str("    this.#render();\n");
    o.push_str("    this.#bindEvents();\n");
    o.push_str("    this.#bindRefs();\n");
    // Fire watches conditionally
    for d in &c.script {
        if let Decl::Watch { deps, .. } = d {
            let deps_key = deps.join("_");
            o.push_str(&format!("    if (__watchFire_{}) {{\n", deps_key));
            o.push_str(&format!("      this.#watch_{}();\n", deps_key));
            for dep in deps {
                o.push_str(&format!(
                    "      this.#__prev_{} = this.#{};\n",
                    dep, dep
                ));
            }
            o.push_str("    }\n");
        }
    }
    o.push_str("  }\n\n");

    // #updateKeepFocus
    o.push_str("  #updateKeepFocus(focusedEl) {\n");
    o.push_str("    const fid = focusedEl?.getAttribute('data-chasket-id');\n");
    o.push_str("    const selStart = focusedEl?.selectionStart;\n");
    o.push_str("    const selEnd = focusedEl?.selectionEnd;\n");
    o.push_str("    this.#update();\n");
    o.push_str("    if (fid) {\n");
    o.push_str(&format!(
        "      const el = {}.querySelector(`[data-chasket-id=\"${{fid}}\"]`);\n",
        root
    ));
    o.push_str("      if (el) { el.focus(); if (selStart != null) { el.selectionStart = selStart; el.selectionEnd = selEnd; } }\n");
    o.push_str("    }\n");
    o.push_str("  }\n\n");

    // #esc
    o.push_str("  #esc(val) {\n");
    o.push_str("    if (val == null) return '';\n");
    o.push_str("    const s = String(val);\n");
    o.push_str("    if (!/[&<>\"']/.test(s)) return s;\n");
    o.push_str("    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');\n");
    o.push_str("  }\n\n");

    // #escAttr
    o.push_str("  #escAttr(val) {\n");
    o.push_str("    if (val == null) return '';\n");
    o.push_str("    const s = String(val);\n");
    o.push_str("    if (!/[&<>\"'`]/.test(s)) return s;\n");
    o.push_str("    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');\n");
    o.push_str("  }\n\n");

    // #escUrl
    o.push_str("  #escUrl(val) {\n");
    o.push_str("    if (val == null) return '';\n");
    o.push_str("    const s = String(val).trim();\n");
    o.push_str(
        "    if (/^\\s*(javascript|data|vbscript)\\s*:/i.test(s)) return 'about:blank';\n",
    );
    o.push_str("    return this.#escAttr(s);\n");
    o.push_str("  }\n");

    o.push_str("}\n\n");

    // Registration
    o.push_str("if (typeof __chasketDefineQueue !== 'undefined') {\n");
    o.push_str(&format!(
        "  __chasketDefineQueue.push(['{}', {}]);\n",
        tn, cn
    ));
    o.push_str("} else {\n");
    o.push_str(&format!(
        "  customElements.define('{}', {});\n",
        tn, cn
    ));
    o.push_str("}\n");
    o.push_str("\n})();\n");

    o
}

// ─── Helper functions ───

fn tag_to_class(tag: &str) -> String {
    tag.split('-')
        .map(|p| {
            let mut c = p.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect()
}

fn camel_to_kebab(s: &str) -> String {
    let mut result = String::new();
    for (i, ch) in s.chars().enumerate() {
        if ch.is_uppercase() && i > 0 {
            result.push('-');
            result.push(ch.to_lowercase().next().unwrap());
        } else {
            result.push(ch);
        }
    }
    result
}

fn min_css(css: &str) -> String {
    let s = Regex::new(r"\s+").unwrap().replace_all(css, " ");
    let s = Regex::new(r"\s*\{\s*").unwrap().replace_all(&s, "{");
    let s = Regex::new(r"\s*}\s*").unwrap().replace_all(&s, "}");
    let s = Regex::new(r"\s*:\s*").unwrap().replace_all(&s, ":");
    let s = Regex::new(r"\s*;\s*").unwrap().replace_all(&s, ";");
    s.trim().to_string()
}

fn type_name(t: &ChasketType) -> &str {
    match t {
        ChasketType::Primitive { name } => name,
        _ => "any",
    }
}

/// Transform expression: replace identifiers with `this.#name` equivalents,
/// but skip identifiers inside string literals.
fn tx(
    expr: &str,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
) -> String {
    tx_safe(expr, &build_replacements(sv, pv, cv, en, fns, rn, cons))
}

fn tx_loop(
    expr: &str,
    loop_ctx: &LoopCtx,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    _cons: &[String],
) -> String {
    let mut reps: Vec<(Regex, String)> = Vec::new();
    for s in sv {
        if s == &loop_ctx.each || s == &loop_ctx.index {
            continue;
        }
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(s))).unwrap(),
            format!("this.#{}", s),
        ));
    }
    for p in pv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(p))).unwrap(),
            format!("this.#prop_{}", p),
        ));
    }
    for v in cv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(v))).unwrap(),
            format!("this.#{}", v),
        ));
    }
    for e in en {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(e))).unwrap(),
            format!("this.#emit_{}(", e),
        ));
    }
    for f in fns {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(f))).unwrap(),
            format!("this.#{}(", f),
        ));
    }
    for r in rn {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(r))).unwrap(),
            format!("this.#{}", r),
        ));
    }
    tx_safe(expr, &reps)
}

fn build_replacements(
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
) -> Vec<(Regex, String)> {
    let mut reps = Vec::new();
    for s in sv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(s))).unwrap(),
            format!("this.#{}", s),
        ));
    }
    for p in pv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(p))).unwrap(),
            format!("this.#prop_{}", p),
        ));
    }
    for v in cv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(v))).unwrap(),
            format!("this.#{}", v),
        ));
    }
    for e in en {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(e))).unwrap(),
            format!("this.#emit_{}(", e),
        ));
    }
    for f in fns {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(f))).unwrap(),
            format!("this.#{}(", f),
        ));
    }
    for r in rn {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(r))).unwrap(),
            format!("this.#{}", r),
        ));
    }
    for c in cons {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(c))).unwrap(),
            format!("this.#{}", c),
        ));
    }
    reps
}

/// Apply replacements only to non-string parts of the expression.
fn tx_safe(expr: &str, replacements: &[(Regex, String)]) -> String {
    let parts = split_string_parts(expr);
    parts
        .iter()
        .map(|(text, is_string)| {
            if *is_string {
                text.clone()
            } else {
                let mut t = text.clone();
                for (pattern, replacement) in replacements {
                    t = pattern.replace_all(&t, replacement.as_str()).to_string();
                }
                t
            }
        })
        .collect()
}

/// Split expression into alternating (code, string-literal) segments.
fn split_string_parts(expr: &str) -> Vec<(String, bool)> {
    let mut parts = Vec::new();
    let chars: Vec<char> = expr.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' || ch == '\'' || ch == '`' {
            let quote = ch;
            let mut j = i + 1;
            while j < chars.len() {
                if chars[j] == '\\' {
                    j += 2;
                    continue;
                }
                if chars[j] == quote {
                    j += 1;
                    break;
                }
                if quote == '`' && chars[j] == '$' && j + 1 < chars.len() && chars[j + 1] == '{' {
                    let mut depth = 1;
                    j += 2;
                    while j < chars.len() && depth > 0 {
                        if chars[j] == '{' {
                            depth += 1;
                        } else if chars[j] == '}' {
                            depth -= 1;
                        }
                        if depth > 0 {
                            j += 1;
                        } else {
                            j += 1;
                            break;
                        }
                    }
                    continue;
                }
                j += 1;
            }
            parts.push((chars[i..j].iter().collect(), true));
            i = j;
        } else {
            let mut j = i;
            while j < chars.len() && chars[j] != '"' && chars[j] != '\'' && chars[j] != '`' {
                j += 1;
            }
            parts.push((chars[i..j].iter().collect(), false));
            i = j;
        }
    }

    parts
}

// ─── Template code generation ───

#[allow(clippy::too_many_arguments)]
fn tpl_str(
    nodes: &[TemplateNode],
    indent: usize,
    loop_ctx: Option<&LoopCtx>,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
    eid: &mut usize,
    bindings: &mut Vec<EventBinding>,
) -> String {
    let pad = " ".repeat(indent);
    let mut o = String::new();

    for n in nodes {
        match n {
            TemplateNode::Text { value } => {
                let v = value.trim();
                if !v.is_empty() {
                    o.push_str(&format!("{}{}\n", pad, v));
                }
            }
            TemplateNode::Interpolation { expr } => {
                let transformed = if let Some(lc) = loop_ctx {
                    tx_loop(expr, lc, sv, pv, cv, en, fns, rn, cons)
                } else {
                    tx(expr, sv, pv, cv, en, fns, rn, cons)
                };
                o.push_str(&format!("{}${{this.#esc({})}}\n", pad, transformed));
            }
            TemplateNode::Element { .. } => {
                o.push_str(&el_str(
                    n, indent, loop_ctx, sv, pv, cv, en, fns, rn, cons, eid, bindings,
                ));
            }
            TemplateNode::If { .. } => {
                o.push_str(&if_str(
                    n, indent, loop_ctx, sv, pv, cv, en, fns, rn, cons, eid, bindings,
                ));
            }
            TemplateNode::For { .. } => {
                o.push_str(&for_str(
                    n, indent, loop_ctx, sv, pv, cv, en, fns, rn, cons, eid, bindings,
                ));
            }
        }
    }

    o
}

#[allow(clippy::too_many_arguments)]
fn el_str(
    node: &TemplateNode,
    indent: usize,
    loop_ctx: Option<&LoopCtx>,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
    eid: &mut usize,
    bindings: &mut Vec<EventBinding>,
) -> String {
    let (tag, attrs, children, self_closing) = match node {
        TemplateNode::Element {
            tag,
            attrs,
            children,
            self_closing,
        } => (tag, attrs, children, *self_closing),
        _ => return String::new(),
    };

    let pad = " ".repeat(indent);
    let ev_attrs: Vec<&Attr> = attrs.iter().filter(|a| a.event).collect();
    let bind_attrs: Vec<&Attr> = attrs.iter().filter(|a| a.bind).collect();
    let has_events = !ev_attrs.is_empty() || !bind_attrs.is_empty();

    let mut eid_val: Option<String> = None;
    if has_events {
        let id = format!("fl-{}", *eid);
        *eid += 1;
        bindings.push(EventBinding {
            eid: id.clone(),
            events: ev_attrs.iter().map(|a| (*a).clone()).collect(),
            binds: bind_attrs.iter().map(|a| (*a).clone()).collect(),
            in_loop: loop_ctx.is_some(),
            loop_ctx: loop_ctx.cloned(),
        });
        eid_val = Some(id);
    }

    let mut attr_str = String::new();
    if let Some(ref id) = eid_val {
        if loop_ctx.is_none() {
            attr_str.push_str(&format!(" data-chasket-id=\"{}\"", id));
        } else if let Some(lc) = loop_ctx {
            attr_str.push_str(&format!(
                " data-chasket-id=\"{}-${{{}}}\"",
                id,
                if lc.index.is_empty() { "__idx" } else { &lc.index }
            ));
        }
    }

    for a in attrs {
        if a.event {
            continue;
        }
        if a.is_ref {
            attr_str.push_str(&format!(" data-ref=\"{}\"", a.value));
            continue;
        }
        if a.bind {
            let tx_expr = if let Some(lc) = loop_ctx {
                tx_loop(&a.value, lc, sv, pv, cv, en, fns, rn, cons)
            } else {
                tx(&a.value, sv, pv, cv, en, fns, rn, cons)
            };
            attr_str.push_str(&format!(" value=\"${{this.#escAttr({})}}\"", tx_expr));
            continue;
        }
        if a.html {
            continue;
        }
        if a.dynamic {
            let tx_expr = if let Some(lc) = loop_ctx {
                tx_loop(&a.value, lc, sv, pv, cv, en, fns, rn, cons)
            } else {
                tx(&a.value, sv, pv, cv, en, fns, rn, cons)
            };
            if a.name == "class" {
                attr_str.push_str(&format!(
                    " class=\"${{this.#escAttr(Object.entries({}).filter(([,v])=>v).map(([k])=>k).join(' '))}}\"",
                    tx_expr
                ));
            } else if ["disabled", "checked", "hidden"].contains(&a.name.as_str()) {
                attr_str.push_str(&format!(" ${{{}?'{}':''}}", tx_expr, a.name));
            } else if ["href", "src", "action", "formaction"].contains(&a.name.as_str()) {
                attr_str.push_str(&format!(
                    " {}=\"${{this.#escUrl({})}}\"",
                    a.name, tx_expr
                ));
            } else {
                attr_str.push_str(&format!(
                    " {}=\"${{this.#escAttr({})}}\"",
                    a.name, tx_expr
                ));
            }
        } else if a.value.is_empty() {
            attr_str.push_str(&format!(" {}", a.name));
        } else {
            attr_str.push_str(&format!(" {}=\"{}\"", a.name, a.value));
        }
    }

    let html_attr = attrs.iter().find(|a| a.html);
    let is_custom = tag.contains('-');

    if self_closing {
        if is_custom {
            return format!("{}<{}{}></{}>\\n", pad, tag, attr_str, tag);
        }
        return format!("{}<{}{} />\\n", pad, tag, attr_str);
    }

    if let Some(ha) = html_attr {
        let tx_expr = if let Some(lc) = loop_ctx {
            tx_loop(&ha.value, lc, sv, pv, cv, en, fns, rn, cons)
        } else {
            tx(&ha.value, sv, pv, cv, en, fns, rn, cons)
        };
        return format!(
            "{}<{}{}>${{{}}}</{}>\\n",
            pad, tag, attr_str, tx_expr, tag
        );
    }

    if is_custom && children.is_empty() {
        return format!("{}<{}{}></{}>\\n", pad, tag, attr_str, tag);
    }

    let children_str = tpl_str(
        children,
        indent + 2,
        loop_ctx,
        sv,
        pv,
        cv,
        en,
        fns,
        rn,
        cons,
        eid,
        bindings,
    );
    format!(
        "{}<{}{}>\\n{}{}</{}>\\n",
        pad, tag, attr_str, children_str, pad, tag
    )
}

#[allow(clippy::too_many_arguments)]
fn if_str(
    node: &TemplateNode,
    indent: usize,
    loop_ctx: Option<&LoopCtx>,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
    eid: &mut usize,
    bindings: &mut Vec<EventBinding>,
) -> String {
    let (condition, children, else_if_chain, else_children) = match node {
        TemplateNode::If {
            condition,
            children,
            else_if_chain,
            else_children,
        } => (condition, children, else_if_chain, else_children),
        _ => return String::new(),
    };

    let pad = " ".repeat(indent);
    let tx_expr = if let Some(lc) = loop_ctx {
        tx_loop(condition, lc, sv, pv, cv, en, fns, rn, cons)
    } else {
        tx(condition, sv, pv, cv, en, fns, rn, cons)
    };

    let mut o = format!(
        "{}${{{}? `\n{}",
        pad,
        tx_expr,
        tpl_str(
            children, indent + 2, loop_ctx, sv, pv, cv, en, fns, rn, cons, eid, bindings
        )
    );

    if let Some(chain) = else_if_chain {
        for branch in chain {
            let branch_expr = if let Some(lc) = loop_ctx {
                tx_loop(&branch.condition, lc, sv, pv, cv, en, fns, rn, cons)
            } else {
                tx(&branch.condition, sv, pv, cv, en, fns, rn, cons)
            };
            o.push_str(&format!(
                "{}` : {} ? `\n{}",
                pad,
                branch_expr,
                tpl_str(
                    &branch.children,
                    indent + 2,
                    loop_ctx,
                    sv,
                    pv,
                    cv,
                    en,
                    fns,
                    rn,
                    cons,
                    eid,
                    bindings
                )
            ));
        }
    }

    if let Some(ec) = else_children {
        o.push_str(&format!(
            "{}` : `\n{}",
            pad,
            tpl_str(
                ec, indent + 2, loop_ctx, sv, pv, cv, en, fns, rn, cons, eid, bindings
            )
        ));
    }

    o.push_str(&format!("{}` : ''}}\n", pad));
    o
}

#[allow(clippy::too_many_arguments)]
fn for_str(
    node: &TemplateNode,
    indent: usize,
    _loop_ctx: Option<&LoopCtx>,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
    eid: &mut usize,
    bindings: &mut Vec<EventBinding>,
) -> String {
    let (each, index, of, children, empty_children) = match node {
        TemplateNode::For {
            each,
            index,
            of,
            children,
            empty_children,
            ..
        } => (each, index, of, children, empty_children),
        _ => return String::new(),
    };

    let pad = " ".repeat(indent);
    let le = tx(of, sv, pv, cv, en, fns, rn, cons);
    let idx_var = index.as_deref().unwrap_or("__idx");
    let for_loop_ctx = LoopCtx {
        each: each.clone(),
        index: idx_var.to_string(),
        of: of.clone(),
    };

    let children_str = tpl_str(
        children,
        indent + 2,
        Some(&for_loop_ctx),
        sv,
        pv,
        cv,
        en,
        fns,
        rn,
        cons,
        eid,
        bindings,
    );

    if let Some(ec) = empty_children {
        let empty_str = tpl_str(
            ec,
            indent + 2,
            None, // empty uses parent loop ctx
            sv,
            pv,
            cv,
            en,
            fns,
            rn,
            cons,
            eid,
            bindings,
        );
        format!(
            "{}${{{}.length > 0 ? {}.map(({}, {}) => `\n{}{}` ).join('') : `\n{}{}`}}\n",
            pad, le, le, each, idx_var, children_str, pad, empty_str, pad
        )
    } else {
        format!(
            "{}${{{}.map(({}, {}) => `\n{}{}` ).join('')}}\n",
            pad, le, each, idx_var, children_str, pad
        )
    }
}

// ─── Event binding code generation ───

#[allow(clippy::too_many_arguments)]
fn build_evt_code(
    root: &str,
    event_bindings: &[EventBinding],
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
) -> String {
    let mut code = String::new();

    for binding in event_bindings {
        if binding.in_loop {
            let lc = binding.loop_ctx.as_ref().unwrap();
            code.push_str(&format!(
                "    // Loop event binding: {}\n",
                binding.eid
            ));
            code.push_str(&format!(
                "    {}.querySelectorAll('[data-chasket-id^=\"{}-\"]').forEach(el => {{\n",
                root, binding.eid
            ));
            code.push_str(
                "      const __idx = parseInt(el.getAttribute('data-chasket-id').split('-').pop(), 10);\n",
            );

            for a in &binding.events {
                let pre = build_modifier_prefix(&a.modifiers);
                let h = build_handler(&a.value, &pre, true, Some(lc), sv, pv, cv, en, fns, rn, cons);
                code.push_str(&format!(
                    "      const fn_{} = {};\n",
                    a.name, h
                ));
                code.push_str(&format!(
                    "      el.addEventListener('{}', fn_{});\n",
                    a.name, a.name
                ));
                code.push_str(&format!(
                    "      this.#listeners.push([el, '{}', fn_{}]);\n",
                    a.name, a.name
                ));
            }

            for a in &binding.binds {
                code.push_str(&format!(
                    "      const fn_input = (e) => {{ this.#{} = e.target.value; this.#update(); }};\n",
                    a.value
                ));
                code.push_str("      el.addEventListener('input', fn_input);\n");
                code.push_str("      this.#listeners.push([el, 'input', fn_input]);\n");
            }

            code.push_str("    });\n");
        } else {
            code.push_str("    {\n");
            code.push_str(&format!(
                "      const el = {}.querySelector('[data-chasket-id=\"{}\"]');\n",
                root, binding.eid
            ));
            code.push_str("      if (el) {\n");

            for a in &binding.events {
                let pre = build_modifier_prefix(&a.modifiers);
                let h = build_handler(&a.value, &pre, false, None, sv, pv, cv, en, fns, rn, cons);
                code.push_str(&format!(
                    "        const fn_{} = {};\n",
                    a.name, h
                ));
                code.push_str(&format!(
                    "        el.addEventListener('{}', fn_{});\n",
                    a.name, a.name
                ));
                code.push_str(&format!(
                    "        this.#listeners.push([el, '{}', fn_{}]);\n",
                    a.name, a.name
                ));
            }

            for a in &binding.binds {
                code.push_str(&format!(
                    "        const fn_input = (e) => {{ this.#{} = e.target.value; this.#updateKeepFocus(el); }};\n",
                    a.value
                ));
                code.push_str(
                    "        el.addEventListener('input', fn_input);\n",
                );
                code.push_str(
                    "        this.#listeners.push([el, 'input', fn_input]);\n",
                );
            }

            code.push_str("      }\n");
            code.push_str("    }\n");
        }
    }
    code
}

fn build_modifier_prefix(modifiers: &[String]) -> String {
    let mut pre = String::new();
    for m in modifiers {
        match m.as_str() {
            "prevent" => pre.push_str("e.preventDefault(); "),
            "stop" => pre.push_str("e.stopPropagation(); "),
            "enter" => pre.push_str("if (e.key !== 'Enter') return; "),
            "esc" => pre.push_str("if (e.key !== 'Escape') return; "),
            _ => {}
        }
    }
    pre
}

#[allow(clippy::too_many_arguments)]
fn build_handler(
    value: &str,
    pre: &str,
    in_loop: bool,
    loop_ctx: Option<&LoopCtx>,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
    cons: &[String],
) -> String {
    let has_assign = value.contains('=') && !value.contains("=>") && !value.contains("==");
    let has_call = value.contains('(');

    if in_loop {
        let lc = loop_ctx.unwrap();
        let transformed = tx_loop_handler(value, lc, sv, pv, cv, en, fns, rn);
        if has_assign || has_call {
            format!("(e) => {{ {}{}; this.#update(); }}", pre, transformed)
        } else {
            format!("(e) => {{ {}this.#{}(); this.#update(); }}", pre, value)
        }
    } else if has_assign || has_call {
        let transformed = tx(value, sv, pv, cv, en, fns, rn, cons);
        format!("(e) => {{ {}{}; this.#update(); }}", pre, transformed)
    } else {
        format!("(e) => {{ {}this.#{}(); this.#update(); }}", pre, value)
    }
}

fn tx_loop_handler(
    expr: &str,
    loop_ctx: &LoopCtx,
    sv: &[String],
    pv: &[String],
    cv: &[String],
    en: &[String],
    fns: &[String],
    rn: &[String],
) -> String {
    let mut r = expr.to_string();
    // Replace the named index variable with __idx
    if !loop_ctx.index.is_empty() && loop_ctx.index != "__idx" {
        let re = Regex::new(&format!(r"\b{}\b", regex::escape(&loop_ctx.index))).unwrap();
        r = re.replace_all(&r, "__idx").to_string();
    }
    let mut reps: Vec<(Regex, String)> = Vec::new();
    for s in sv {
        if s == &loop_ctx.each || s == &loop_ctx.index {
            continue;
        }
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(s))).unwrap(),
            format!("this.#{}", s),
        ));
    }
    for p in pv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(p))).unwrap(),
            format!("this.#prop_{}", p),
        ));
    }
    for v in cv {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(v))).unwrap(),
            format!("this.#{}", v),
        ));
    }
    for e in en {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(e))).unwrap(),
            format!("this.#emit_{}(", e),
        ));
    }
    for f in fns {
        reps.push((
            Regex::new(&format!(r"\b{}\(", regex::escape(f))).unwrap(),
            format!("this.#{}(", f),
        ));
    }
    for r_name in rn {
        reps.push((
            Regex::new(&format!(r"\b{}\b", regex::escape(r_name))).unwrap(),
            format!("this.#{}", r_name),
        ));
    }
    tx_safe(&r, &reps)
}
