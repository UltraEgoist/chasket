/**
 * @chasket/chasket-router — CJS entry
 * Client-side router for Chasket SPA applications.
 */

'use strict';

// ============================================================
// Route Matching Engine
// ============================================================

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePattern(pattern) {
  if (pattern === '*') {
    return { regex: /^\/(.*)$/, paramNames: ['*'], isWildcard: true };
  }
  const paramNames = [];
  let isWildcard = false;
  const regexStr = pattern
    .split('/')
    .map(segment => {
      if (!segment) return '';
      if (segment === '*') {
        isWildcard = true;
        paramNames.push('*');
        return '/(.*)';
      }
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '/([^/]+)';
      }
      return '/' + escapeRegex(segment);
    })
    .join('');
  const finalRegex = new RegExp('^' + (regexStr || '/') + '$');
  return { regex: finalRegex, paramNames, isWildcard };
}

function matchRoute(pathname, compiled) {
  const m = compiled.regex.exec(pathname);
  if (!m) return { matched: false, params: {} };
  const params = {};
  compiled.paramNames.forEach((name, i) => {
    params[name] = decodeURIComponent(m[i + 1] || '');
  });
  return { matched: true, params };
}

function parseQuery(search) {
  // セキュリティ: Object.create(null) でプロトタイプチェーンを排除
  const q = Object.create(null);
  if (!search || search === '?') return q;
  const str = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of str.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      const decodedKey = decodeURIComponent(key);
      // セキュリティ: プロトタイプ汚染を防止する危険なキーをフィルタ
      if (decodedKey === '__proto__' || decodedKey === 'constructor' || decodedKey === 'prototype') continue;
      const val = rest.join('=');
      q[decodedKey] = val !== undefined ? decodeURIComponent(val) : '';
    }
  }
  return q;
}

// ============================================================
// Router Core (no DOM — for SSR/testing)
// ============================================================

function createRouter(options = {}) {
  const routes = (options.routes || []).map(r => ({
    ...r,
    _compiled: compilePattern(r.path),
    _children: r.children ? r.children.map(c => ({
      ...c,
      _compiled: compilePattern(r.path.replace(/\/$/, '') + c.path),
    })) : [],
  }));

  const mode = options.mode || 'history';
  const base = (options.base || '').replace(/\/$/, '');

  let currentRoute = { path: '/', params: {}, query: {}, meta: {}, component: null, hash: '' };
  const listeners = new Set();
  const beforeGuards = [];
  const afterHooks = [];

  function getLocation() {
    if (typeof window === 'undefined') return { pathname: '/', search: '', hash: '' };
    if (mode === 'hash') {
      const hash = window.location.hash.slice(1) || '/';
      const [pathname, search] = hash.split('?');
      return { pathname: pathname || '/', search: search ? '?' + search : '', hash: '' };
    }
    return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
  }

  function resolve(pathname) {
    const path = base ? pathname.replace(new RegExp('^' + escapeRegex(base)), '') || '/' : pathname;
    const allRoutes = [];
    for (const r of routes) {
      for (const c of r._children) allRoutes.push(c);
      allRoutes.push(r);
    }
    for (const route of allRoutes) {
      const { matched, params } = matchRoute(path, route._compiled);
      if (matched) return { route, params };
    }
    return { route: null, params: {} };
  }

  function parsePath(path) {
    const hashIdx = path.indexOf('#');
    let hash = '';
    if (hashIdx >= 0) { hash = path.slice(hashIdx); path = path.slice(0, hashIdx); }
    const qIdx = path.indexOf('?');
    let search = '';
    if (qIdx >= 0) { search = path.slice(qIdx); path = path.slice(0, qIdx); }
    return { pathname: path || '/', search, hash };
  }

  async function navigateInternal(to, replace) {
    // セキュリティ: 危険なプロトコルスキームやクロスオリジンURLを拒否
    if (typeof to === 'string') {
      // セキュリティ: 制御文字（タブ、改行等）を除去してバイパスを防止
      const trimmed = to.replace(/[\x00-\x1F\x7F]/g, '').trim();
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith('//')) {
        console.error('[chasket-router] Blocked navigation to dangerous URL:', trimmed);
        return false;
      }
      if (trimmed.startsWith('//')) {
        console.error('[chasket-router] Blocked navigation to protocol-relative URL:', trimmed);
        return false;
      }
    }

    const loc = typeof to === 'string' ? parsePath(to) : to;
    const { route, params } = resolve(loc.pathname);
    const newRoute = {
      path: loc.pathname, params, query: parseQuery(loc.search || ''),
      meta: route ? (route.meta || {}) : {}, component: route ? route.component : null,
      hash: loc.hash || '', matched: !!route,
    };

    for (const guard of beforeGuards) {
      const result = await guard(newRoute, currentRoute);
      if (result === false) return false;
      if (typeof result === 'string') return navigateInternal(result, replace);
    }

    if (typeof window !== 'undefined') {
      const fullPath = base + loc.pathname + (loc.search || '') + (loc.hash || '');
      if (mode === 'hash') {
        if (replace) window.location.replace('#' + loc.pathname + (loc.search || ''));
        else window.location.hash = loc.pathname + (loc.search || '');
      } else {
        if (replace) window.history.replaceState({ chasketRouter: true }, '', fullPath);
        else window.history.pushState({ chasketRouter: true }, '', fullPath);
      }
    }

    const prevRoute = currentRoute;
    currentRoute = newRoute;

    for (const fn of listeners) {
      try { fn(currentRoute, prevRoute); } catch (e) { console.error('[chasket-router] listener error:', e); }
    }
    for (const hook of afterHooks) {
      try { await hook(currentRoute, prevRoute); } catch (e) { console.error('[chasket-router] afterEach error:', e); }
    }
    return true;
  }

  function handlePopState() {
    const loc = getLocation();
    navigateInternal(loc.pathname + loc.search + (loc.hash || ''), true);
  }

  const router = {
    get current() { return currentRoute; },
    push(to) { return navigateInternal(to, false); },
    replace(to) { return navigateInternal(to, true); },
    back() { if (typeof window !== 'undefined') window.history.back(); },
    forward() { if (typeof window !== 'undefined') window.history.forward(); },
    go(delta) { if (typeof window !== 'undefined') window.history.go(delta); },
    beforeEach(fn) {
      beforeGuards.push(fn);
      return () => { const i = beforeGuards.indexOf(fn); if (i >= 0) beforeGuards.splice(i, 1); };
    },
    afterEach(fn) {
      afterHooks.push(fn);
      return () => { const i = afterHooks.indexOf(fn); if (i >= 0) afterHooks.splice(i, 1); };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    resolve(path) {
      // セキュリティ: 制御文字を除去してプロトコルバイパスを防止
      const sanitized = typeof path === 'string' ? path.replace(/[\x00-\x1F\x7F]/g, '').trim() : path;
      // セキュリティ: 危険なプロトコルスキームをブロック
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(sanitized) && !sanitized.startsWith('//')) {
        return { path: '/', params: {}, query: {}, meta: {}, component: null, matched: false };
      }
      const loc = parsePath(sanitized);
      const { route, params } = resolve(loc.pathname);
      return {
        path: loc.pathname, params, query: parseQuery(loc.search),
        meta: route ? (route.meta || {}) : {}, component: route ? route.component : null, matched: !!route,
      };
    },
    start() {
      if (typeof window !== 'undefined') {
        if (mode === 'hash') window.addEventListener('hashchange', handlePopState);
        else window.addEventListener('popstate', handlePopState);
      }
      const loc = getLocation();
      return navigateInternal(loc.pathname + loc.search + (loc.hash || ''), true);
    },
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('hashchange', handlePopState);
      }
      listeners.clear();
      beforeGuards.length = 0;
      afterHooks.length = 0;
    },
    get routes() { return routes.map(r => ({ path: r.path, component: r.component, meta: r.meta })); },
  };

  return router;
}

module.exports = createRouter;
module.exports.default = createRouter;
module.exports.createRouter = createRouter;
module.exports.compilePattern = compilePattern;
module.exports.matchRoute = matchRoute;
module.exports.parseQuery = parseQuery;
