# Changelog

All notable changes to the Chasket VSCode extension will be documented in this file.

## [0.3.0] - 2026-04-01

### Added

- Support for ES Module imports in `.csk` files with proper syntax highlighting
- TypeScript file type recognition and IntelliSense improvements
- Enhanced import path suggestions for bundle output locations
- Improved template module detection for `<script type="module">` blocks

### Fixed

- Fixed completion suggestions not appearing in TypeScript files
- Improved syntax highlighting for modern ES module syntax

## [0.2.2] - 2026-03-30

### Added

- **65 event completions** — All DOM events (`@click`, `@keydown`, `@pointerdown`, etc.) with bilingual descriptions
- **Event modifier completions** — Type `@click|` to get `prevent`, `stop`, `once`, `self`, `capture`, `enter`, `esc` suggestions
- **Context-aware completions** — Suggestions filtered by block type (script / template / meta / style)
- **Cross-file component completion** — Auto-suggests project component tags from other `.csk` files
- **Expression completions** — Symbol suggestions inside `{{ }}` interpolations and `@event="..."` attribute values
- **Bilingual UI (EN/JA)** — All hover docs, completions, and diagnostics auto-switch based on `vscode.env.language`
- **Comprehensive hover info** — 44 keyword/directive entries with Markdown-formatted documentation
- **Event type hints** — Hover over `@click` shows `MouseEvent`, `@keydown` shows `KeyboardEvent`, etc.
- **Binding attribute highlighting** — Expression syntax highlighting inside `@event="..."` and `:bind="..."` values
- **Custom element tag scope** — Hyphenated tags highlighted as `entity.name.tag.component.csk`
- **Marketplace icon** — 128x128 PNG icon for VS Code Marketplace

### Fixed

- Duplicate `ref` key in completions dictionary (template ref renamed to `ref=`)
- Meta block filter incorrectly matching partial keys (`:name`, `:for`)
- Missing events in completions that were present in tmLanguage grammar

## [0.1.0] - 2025-12-01

### Added

- Initial release
- TextMate grammar for `.csk` syntax highlighting
- Embedded language support (HTML, CSS, JavaScript)
- Basic hover provider
- Diagnostics provider with 16 validation rules
- Definition provider for component symbols
- Document symbol provider
- LSP client with stdio transport (fallback to inline providers)
