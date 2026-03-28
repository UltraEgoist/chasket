use crate::ast::ChasketType;

/// Parse a type annotation string into a ChasketType AST node.
pub fn parse_type(raw: &str) -> ChasketType {
    let s = raw.trim();

    // Array: T[]
    if s.ends_with("[]") {
        return ChasketType::Array {
            element: Box::new(parse_type(&s[..s.len() - 2])),
        };
    }

    // Union: A | B
    if s.contains('|') && !s.starts_with('{') {
        let types = s
            .split('|')
            .map(|p| {
                let t = p.trim();
                if t.starts_with('"') || t.starts_with('\'') {
                    ChasketType::Literal {
                        value: t.replace(&['"', '\''][..], ""),
                    }
                } else {
                    parse_type(t)
                }
            })
            .collect();
        return ChasketType::Union { types };
    }

    // Primitives
    match s {
        "string" | "number" | "boolean" | "void" | "null" | "undefined" | "any" | "never"
        | "unknown" | "object" | "bigint" | "symbol" => {
            return ChasketType::Primitive {
                name: s.to_string(),
            };
        }
        _ => {}
    }

    // Literal string
    if s.starts_with('"') || s.starts_with('\'') {
        return ChasketType::Literal {
            value: s.replace(&['"', '\''][..], ""),
        };
    }

    // Object literal: { field: Type, ... }
    if s.starts_with('{') && s.ends_with('}') {
        let inner = &s[1..s.len() - 1].trim();
        let mut fields = Vec::new();
        for fp in inner.split(',').map(|f| f.trim()).filter(|f| !f.is_empty()) {
            let re = regex::Regex::new(r"^(\w+)(\?)?\s*:\s*(.+)$").unwrap();
            if let Some(m) = re.captures(fp) {
                fields.push(crate::ast::ObjectField {
                    name: m[1].to_string(),
                    field_type: parse_type(&m[3]),
                    optional: m.get(2).map_or(false, |v| v.as_str() == "?"),
                });
            }
        }
        return ChasketType::Object { fields };
    }

    // Fallback: treat as named type (primitive-like)
    ChasketType::Primitive {
        name: s.to_string(),
    }
}

/// Convert a ChasketType to a TypeScript type string.
pub fn type_to_ts(t: &ChasketType) -> String {
    match t {
        ChasketType::Primitive { name } => name.clone(),
        ChasketType::Array { element } => format!("{}[]", type_to_ts(element)),
        ChasketType::Union { types } => types.iter().map(type_to_ts).collect::<Vec<_>>().join(" | "),
        ChasketType::Literal { value } => format!("\"{}\"", value),
        ChasketType::Object { fields } => {
            let fs: Vec<String> = fields
                .iter()
                .map(|f| {
                    format!(
                        "{}{}:{}",
                        f.name,
                        if f.optional { "?" } else { "" },
                        type_to_ts(&f.field_type)
                    )
                })
                .collect();
            format!("{{ {} }}", fs.join("; "))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_primitive() {
        match parse_type("string") {
            ChasketType::Primitive { name } => assert_eq!(name, "string"),
            _ => panic!("Expected primitive"),
        }
    }

    #[test]
    fn test_parse_array() {
        match parse_type("string[]") {
            ChasketType::Array { element } => match *element {
                ChasketType::Primitive { name } => assert_eq!(name, "string"),
                _ => panic!("Expected primitive element"),
            },
            _ => panic!("Expected array"),
        }
    }

    #[test]
    fn test_parse_union() {
        match parse_type("string | number") {
            ChasketType::Union { types } => assert_eq!(types.len(), 2),
            _ => panic!("Expected union"),
        }
    }

    #[test]
    fn test_type_to_ts() {
        let t = ChasketType::Array {
            element: Box::new(ChasketType::Primitive {
                name: "string".into(),
            }),
        };
        assert_eq!(type_to_ts(&t), "string[]");
    }
}
