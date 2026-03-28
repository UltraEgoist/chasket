#!/usr/bin/env node
/**
 * Chasket Documentation Site — Static Site Generator
 *
 * Uses chasket-ssr to render Chasket components into static HTML pages.
 * Supports Markdown content with code highlighting via inline CSS.
 *
 * Usage: node build.js
 * Output: dist/ directory with static HTML files
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { renderToString, renderPage, escapeHtml } = require('../chasket-ssr/index.js');

// ============================================================
// Markdown-lite Parser (subset for docs)
// ============================================================

function parseMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inCode = false;
  let codeLang = '';
  let codeBuffer = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuffer = '';
      } else {
        html += renderCodeBlock(codeBuffer.trimEnd(), codeLang);
        inCode = false;
        codeLang = '';
      }
      continue;
    }

    if (inCode) {
      codeBuffer += line + '\n';
      continue;
    }

    // Close list if no longer in one
    if (inList && !line.startsWith('- ') && !line.startsWith('* ') && line.trim() !== '') {
      html += '</ul>\n';
      inList = false;
    }

    // HTML pass-through (lines starting with < that are raw HTML)
    if (/^<\/?[a-zA-Z]/.test(line.trim()) && !line.trim().startsWith('<#')) {
      html += line + '\n';
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      const text = line.slice(4);
      const id = slugify(text);
      html += `<h3 id="${id}">${processInline(text)}</h3>\n`;
    } else if (line.startsWith('## ')) {
      const text = line.slice(3);
      const id = slugify(text);
      html += `<h2 id="${id}">${processInline(text)}</h2>\n`;
    } else if (line.startsWith('# ')) {
      const text = line.slice(2);
      const id = slugify(text);
      html += `<h1 id="${id}">${processInline(text)}</h1>\n`;
    }
    // Unordered lists
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html += '<ul>\n';
        inList = true;
      }
      html += `<li>${processInline(line.slice(2))}</li>\n`;
    }
    // Horizontal rule
    else if (line === '---') {
      html += '<hr>\n';
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      html += `<blockquote>${processInline(line.slice(2))}</blockquote>\n`;
    }
    // Empty line
    else if (line.trim() === '') {
      if (inList) {
        html += '</ul>\n';
        inList = false;
      }
    }
    // Paragraph
    else {
      html += `<p>${processInline(line)}</p>\n`;
    }
  }

  if (inList) html += '</ul>\n';
  return html;
}

function processInline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\u3000-\u9fff]+/g, '-').replace(/^-|-$/g, '');
}

function renderCodeBlock(code, lang) {
  const escaped = escapeHtml(code);
  const highlighted = highlightSyntax(escaped, lang);
  return `<div class="code-block"><div class="code-lang">${lang || 'text'}</div><pre><code class="language-${lang || 'text'}">${highlighted}</code></pre></div>\n`;
}

// ============================================================
// Simple Syntax Highlighter (CSS-class based)
// ============================================================

function highlightSyntax(code, lang) {
  if (!lang) return code;

  if (lang === 'chasket' || lang === 'html') {
    return highlightChasket(code);
  }
  if (lang === 'javascript' || lang === 'js') {
    return highlightJS(code);
  }
  if (lang === 'bash' || lang === 'sh') {
    return highlightBash(code);
  }
  return code;
}

function highlightChasket(code) {
  return code
    // Tags
    .replace(/(&lt;\/?)(meta|script|template|style)(&gt;)/g, '$1<span class="hl-tag">$2</span>$3')
    // Chasket keywords
    .replace(/\b(state|prop|computed|fn|emit|watch|provide|consume|import|from|type)\b/g, '<span class="hl-keyword">$1</span>')
    // Directives
    .replace(/(@\w+)/g, '<span class="hl-directive">$1</span>')
    .replace(/(#if|#for|#else|:else-if|:else|:empty|:bind)/g, '<span class="hl-directive">$1</span>')
    // Strings
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-string">$1</span>')
    // Types
    .replace(/:\s*(string|number|boolean|object|array)/g, ': <span class="hl-type">$1</span>')
    // Comments
    .replace(/(\/\/.*)/g, '<span class="hl-comment">$1</span>');
}

function highlightJS(code) {
  return code
    .replace(/\b(const|let|var|function|return|if|else|for|while|new|class|extends|import|export|from|async|await|require)\b/g, '<span class="hl-keyword">$1</span>')
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-string">$1</span>')
    .replace(/(&#39;[^&]*?&#39;)/g, '<span class="hl-string">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="hl-comment">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="hl-number">$1</span>');
}

function highlightBash(code) {
  return code
    .replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
    .replace(/\b(npm|npx|node|chasket|cd|mkdir)\b/g, '<span class="hl-keyword">$1</span>');
}

// ============================================================
// Page Definitions
// ============================================================

const pages = [
  { slug: 'index', title: 'Chasket — Template-First Web Components', template: 'home' },
  { slug: 'getting-started', title: 'Getting Started — Chasket', template: 'getting-started' },
  { slug: 'api', title: 'API Reference — Chasket', template: 'api' },
  { slug: 'components', title: 'Component Syntax — Chasket', template: 'components' },
  { slug: 'ssr', title: 'Server-Side Rendering — Chasket', template: 'ssr' },
  { slug: 'router', title: 'Router — Chasket', template: 'router' },
  { slug: 'store', title: 'State Store — Chasket', template: 'store' },
  { slug: 'security', title: 'Security — Chasket', template: 'security' },
];

// ============================================================
// Layout
// ============================================================

function buildNav(currentSlug) {
  const links = pages.map(p => {
    const active = p.slug === currentSlug ? ' class="active"' : '';
    const href = p.slug === 'index' ? '/' : `/${p.slug}.html`;
    return `<a href="${href}"${active}>${p.title.split(' — ')[0]}</a>`;
  });
  return links.join('\n          ');
}

function buildLayout(slug, title, content) {
  const nav = buildNav(slug);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Chasket — テンプレートファーストのWeb Componentsフレームワーク。.chasketファイルからネイティブWeb Componentsにコンパイル。">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a href="/" class="logo">
        <span class="logo-icon">&#x1F525;</span> Chasket
      </a>
      <nav class="main-nav">
        <a href="/getting-started.html">Getting Started</a>
        <a href="/components.html">Syntax</a>
        <a href="/api.html">API</a>
        <a href="/ssr.html">SSR</a>
        <a href="/router.html">Router</a>
        <a href="/store.html">Store</a>
        <a href="/demos/">Demos</a>
        <a href="https://github.com/UltraEgoist/chasket" target="_blank">GitHub</a>
      </nav>
    </div>
  </header>

  <div class="page-body">
    <aside class="sidebar">
      <nav class="side-nav">
        ${nav}
      </nav>
    </aside>
    <main class="content">
      ${content}
    </main>
  </div>

  <footer class="site-footer">
    <div class="container">
      <p>Chasket v0.2.0 &mdash; MIT License &mdash; Built with Chasket SSR</p>
    </div>
  </footer>
</body>
</html>`;
}

// ============================================================
// Build
// ============================================================

function build() {
  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // Copy static assets
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    for (const f of fs.readdirSync(publicDir)) {
      fs.copyFileSync(path.join(publicDir, f), path.join(distDir, f));
    }
  }

  // Build each page
  for (const page of pages) {
    const mdPath = path.join(__dirname, 'src', 'pages', `${page.template}.md`);
    if (!fs.existsSync(mdPath)) {
      console.warn(`  [skip] ${page.slug} — no content file found`);
      continue;
    }

    const md = fs.readFileSync(mdPath, 'utf-8');
    const content = parseMarkdown(md);
    const html = buildLayout(page.slug, page.title, content);

    const outFile = page.slug === 'index' ? 'index.html' : `${page.slug}.html`;
    fs.writeFileSync(path.join(distDir, outFile), html);
    console.log(`  [build] ${outFile}`);
  }

  // Copy demo files
  const demoSrcDir = path.join(__dirname, 'demos');
  const demoDistDir = path.join(distDir, 'demos');
  if (fs.existsSync(demoSrcDir)) {
    fs.mkdirSync(demoDistDir, { recursive: true });
    fs.mkdirSync(path.join(demoDistDir, 'dist'), { recursive: true });

    // Copy demo index.html
    const demoIndex = path.join(demoSrcDir, 'index.html');
    if (fs.existsSync(demoIndex)) {
      fs.copyFileSync(demoIndex, path.join(demoDistDir, 'index.html'));
      console.log('  [build] demos/index.html');
    }

    // Copy compiled JS bundle
    const demoBundle = path.join(demoSrcDir, 'dist', 'chasket-demos.js');
    if (fs.existsSync(demoBundle)) {
      fs.copyFileSync(demoBundle, path.join(demoDistDir, 'dist', 'chasket-demos.js'));
      console.log('  [build] demos/dist/chasket-demos.js');
    }
  }

  console.log(`\nBuild complete: ${distDir}`);
}

build();
