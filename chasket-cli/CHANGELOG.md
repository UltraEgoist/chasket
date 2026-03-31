# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-04-01

### New Features

- ES Module support: components with `import` statements are output without IIFE wrapper
- TypeScript file auto-transpilation: `.ts` files in `src/lib/` are automatically stripped of types and output to `dist/`
- Dev server on-the-fly TS transpilation: `.ts` files served as `.js` with type stripping
- Bundle import path resolution: import paths automatically rewritten for bundle output location
- `chasket init` template now uses `<script type="module">`

### Bug Fixes

- Fixed dev mode `buildAll` not passing `config.target` to compiler
- Fixed `.d.ts` files being incorrectly transpiled to JS
- Fixed `components/components/` double nesting when `config.src = "src"`
- Fixed bundle import paths not being rewritten from source to output tree

### Security

- Path traversal protection on bundle import path rewriting
- ReDoS prevention: `stripTypes` regex patterns bounded with quantifier limits
- Bare specifier protection: npm package imports pass through unchanged

## [0.2.2] - 2026-03-30

### Previous releases

See git history for earlier versions.
