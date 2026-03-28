# Chasket Roadmap

**Updated:** 2026-03-28

---

## Current: v0.2.x — Drop-in Web Components

Chasket's core strength is producing lightweight, dependency-free Web Components that work anywhere — static sites, WordPress, or alongside React/Vue/Angular.

**Focus areas:**

- Compiler quality and correctness
- npm package publication
- Documentation and getting-started experience

**Recent improvements (v0.2.0):**

- `:class` attribute merging (static + dynamic class in a single attribute)
- Inline element whitespace control (`<code>`, `<span>`, `<a>`, etc.)
- Custom element attribute passthrough in `#patch()`
- 5 rounds of security auditing (37 fixes)
- SSR streaming, hydration support

---

## Next: v0.3.x — Small-to-Medium SPA

Expanding Chasket's reach to applications that use dynamic lists and layout composition patterns.

**Planned:**

- Keyed list reconciliation for `<#for>` loops
- Dynamic `<slot>` content updates
- CSP `style-src` improvements

---

## Future: v0.4.x+ — Full-Scale SPA

Making Chasket viable for large production applications.

**Planned:**

- Rust compiler code generation (build speed)
- ESM bundle output
- E2E testing with Playwright
- Chrome DevTools extension

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to get involved. Feature requests and bug reports are welcome via GitHub Issues.
