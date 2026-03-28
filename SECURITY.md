# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Chasket, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities.
2. Send an email to **security@aspect-chasket.dev** with the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge your report within **48 hours**.
- **Assessment**: We will assess the severity and impact within **5 business days**.
- **Fix timeline**: Critical vulnerabilities will be patched within **7 days**. High-severity issues within **14 days**.
- **Disclosure**: We will coordinate with you on public disclosure timing. We follow a **90-day disclosure policy** — if a fix is not released within 90 days, you may disclose the vulnerability publicly.

### Scope

The following are in scope for security reports:

- **Chasket compiler** (`@chasket/chasket`): Code injection via compiled output, XSS bypass in template rendering, path traversal in file operations
- **Development server** (`chasket dev`): Directory traversal, CORS bypass, WebSocket injection
- **Router** (`@chasket/chasket-router`): Open redirect, URL injection, path traversal
- **Store** (`@chasket/chasket-store`): Prototype pollution, state injection
- **UI components** (`@chasket/chasket-ui`): XSS via props/slots, accessibility bypass
- **Vite plugin** (`@chasket/vite-plugin-chasket`): Code injection via transform

### Out of Scope

- Issues that require physical access to the user's machine
- Social engineering attacks
- Denial of service attacks against the dev server (it's localhost-only)
- Issues in dependencies (report to the dependency maintainer directly)

## Security Design Principles

Chasket is designed with the following security principles:

1. **Auto-escaping by default**: All `{{ }}` interpolation is HTML-escaped. Raw HTML requires explicit `@html` opt-in.
2. **Attribute escaping**: Dynamic attributes (`:src`, `:href`, etc.) are escaped via `#escAttr()`.
3. **URL validation**: Dynamic `href` and `src` attributes are validated against dangerous protocols (`javascript:`, `data:`, `vbscript:`).
4. **Scope isolation**: Each compiled component is wrapped in an IIFE to prevent scope leakage.
5. **No eval()**: The dev server HMR uses Blob URLs instead of `eval()` for code execution.
6. **CSP compatibility**: The dev server sets `Content-Security-Policy` headers that restrict script sources.
7. **Localhost binding**: The dev server binds to `127.0.0.1` only — not exposed to the network.
8. **Path traversal protection**: The dev server validates all file paths and rejects `..` traversal attempts.
9. **Symlink protection**: The dev server checks for symbolic links to prevent TOCTOU attacks.
10. **Deep clone safety**: The store's `deepClone` function has depth limits and circular reference detection to prevent stack overflow.

## Security Audit

Chasket has undergone multiple rounds of internal security auditing covering XSS, code injection, path traversal, prototype pollution, ReDoS, open redirect, and CORS/CSP. All identified issues have been resolved, with the exception of one low-priority item (style-src). Detailed audit records are maintained internally.

## Acknowledgments

We thank all security researchers who responsibly disclose vulnerabilities. Contributors will be acknowledged here (with permission):

<!-- Security researchers will be listed here -->
