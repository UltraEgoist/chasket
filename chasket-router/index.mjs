/**
 * @chasket/chasket-router — Client-side router for Chasket SPA applications
 *
 * Provides History API-based routing with:
 * - Declarative route definition via <chasket-router> and <chasket-route>
 * - Dynamic path parameters (/users/:id)
 * - Wildcard / catch-all routes (/files/*)
 * - Nested routes
 * - Navigation guards (beforeEach / afterEach)
 * - Programmatic navigation (router.push / router.replace / router.back)
 * - <chasket-link> for declarative navigation with active class
 * - Route metadata and query string parsing
 *
 * Usage:
 *   import { createRouter, ChasketRouter, ChasketRoute, ChasketLink } from '@chasket/chasket-router'
 *
 *   const router = createRouter({
 *     routes: [
 *       { path: '/', component: 'x-home' },
 *       { path: '/users/:id', component: 'x-user-detail' },
 *       { path: '/about', component: 'x-about' },
 *       { path: '*', component: 'x-not-found' }
 *     ]
 *   });
 *
 * In HTML:
 *   <chasket-router>
 *     <chasket-link to="/">Home</chasket-link>
 *     <chasket-link to="/about">About</chasket-link>
 *     <chasket-route></chasket-route>
 *   </chasket-router>
 *
 * @module @chasket/chasket-router
 */

// ============================================================
// Route Matching Engine
// ============================================================

/**
 * Parse a route pattern into a regex and param name list.
 *
 * Supports:
 *   /users/:id        → named parameter
 *   /files/*           → wildcard (rest)
 *   /users/:id/posts   → multiple segments
 *
 * @param {string} pattern - Route path pattern
 * @returns {{ regex: RegExp, paramNames: string[], isWildcard: boolean }}
 */
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a pathname against a compiled route.
 *
 * @param {string} pathname
 * @param {{ regex: RegExp, paramNames: string[] }} compiled
 * @returns {{ matched: boolean, params: Object }}
 */
function matchRoute(pathname, compiled) {
  const m = compiled.regex.exec(pathname);
  if (!m) return { matched: false, params: {} };

  const params = {};
  compiled.paramNames.forEach((name, i) => {
    params[name] = decodeURIComponent(m[i + 1] || '');
  });
  return { matched: true, params };
}

/**
 * Parse query string into an object.
 * @param {string} search - e.g. "?foo=bar&baz=1"
 * @returns {Object}
 */
function parseQuery(search) {
  const q = {};
  if (!search || search === '?') return q;
  const str = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of str.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) {
      const val = rest.join('=');
      q[decodeURIComponent(key)] = val !== undefined ? decodeURIComponent(val) : '';
    }
  }
  return q;
}

// ============================================================
// Router Core
// ============================================================

/**
 * Create a new Chasket Router instance.
 *
 * @param {Object} options
 * @param {Array<{ path: string, component: string, meta?: Object, children?: Array }>} options.routes
 * @param {string} [options.mode='history'] - 'history' (pushState) or 'hash'
 * @param {string} [options.base=''] - Base path prefix
 * @returns {ChasketRouterInstance}
 */
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

  // ── State ──
  let currentRoute = { path: '/', params: {}, query: {}, meta: {}, component: null, hash: '' };
  const listeners = new Set();
  const beforeGuards = [];
  const afterHooks = [];

  // ── Internal helpers ──

  function getLocation() {
    if (mode === 'hash') {
      const hash = window.location.hash.slice(1) || '/';
      const [pathname, search] = hash.split('?');
      return {
        pathname: pathname || '/',
        search: search ? '?' + search : '',
        hash: '',
      };
    }
    return {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    };
  }

  function resolve(pathname) {
    const path = base ? pathname.replace(new RegExp('^' + escapeRegex(base)), '') || '/' : pathname;

    // Flatten routes (parent + children)
    const allRoutes = [];
    for (const r of routes) {
      // Children first (more specific)
      for (const c of r._children) {
        allRoutes.push(c);
      }
      allRoutes.push(r);
    }

    for (const route of allRoutes) {
      const { matched, params } = matchRoute(path, route._compiled);
      if (matched) {
        return { route, params };
      }
    }
    return { route: null, params: {} };
  }

  async function navigate(to, replace = false) {
    // セキュリティ: 危険なプロトコルスキームやクロスオリジンURLを拒否
    if (typeof to === 'string') {
      const trimmed = to.trim();
      // javascript:, data:, vbscript: 等のスキームを拒否
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith('//')) {
        console.error('[chasket-router] Blocked navigation to dangerous URL:', trimmed);
        return false;
      }
      // プロトコル相対URL（//attacker.com）を拒否
      if (trimmed.startsWith('//')) {
        console.error('[chasket-router] Blocked navigation to protocol-relative URL:', trimmed);
        return false;
      }
    }

    const loc = typeof to === 'string' ? parsePath(to) : to;
    const { route, params } = resolve(loc.pathname);

    const newRoute = {
      path: loc.pathname,
      params,
      query: parseQuery(loc.search || ''),
      meta: route ? (route.meta || {}) : {},
      component: route ? route.component : null,
      hash: loc.hash || '',
      matched: !!route,
    };

    // ── Before guards ──
    for (const guard of beforeGuards) {
      const result = await guard(newRoute, currentRoute);
      if (result === false) return false; // navigation cancelled
      if (typeof result === 'string') {
        // Redirect
        return navigate(result, replace);
      }
    }

    // ── Update browser URL ──
    const fullPath = base + loc.pathname + (loc.search || '') + (loc.hash || '');
    if (mode === 'hash') {
      if (replace) {
        window.location.replace('#' + loc.pathname + (loc.search || ''));
      } else {
        window.location.hash = loc.pathname + (loc.search || '');
      }
    } else {
      if (replace) {
        window.history.replaceState({ chasketRouter: true }, '', fullPath);
      } else {
        window.history.pushState({ chasketRouter: true }, '', fullPath);
      }
    }

    const prevRoute = currentRoute;
    currentRoute = newRoute;

    // ── Notify listeners ──
    for (const fn of listeners) {
      try { fn(currentRoute, prevRoute); } catch (e) { console.error('[chasket-router] listener error:', e); }
    }

    // ── After hooks ──
    for (const hook of afterHooks) {
      try { await hook(currentRoute, prevRoute); } catch (e) { console.error('[chasket-router] afterEach error:', e); }
    }

    return true;
  }

  function parsePath(path) {
    const hashIdx = path.indexOf('#');
    let hash = '';
    if (hashIdx >= 0) {
      hash = path.slice(hashIdx);
      path = path.slice(0, hashIdx);
    }
    const qIdx = path.indexOf('?');
    let search = '';
    if (qIdx >= 0) {
      search = path.slice(qIdx);
      path = path.slice(0, qIdx);
    }
    return { pathname: path || '/', search, hash };
  }

  function handlePopState() {
    const loc = getLocation();
    navigate(loc.pathname + loc.search + (loc.hash || ''), true);
  }

  // ── Public API ──

  const router = {
    /** Current route (reactive read) */
    get current() { return currentRoute; },

    /** Navigate to a new path */
    push(to) { return navigate(to, false); },

    /** Replace current path without adding history entry */
    replace(to) { return navigate(to, true); },

    /** Go back */
    back() { window.history.back(); },

    /** Go forward */
    forward() { window.history.forward(); },

    /** Go to specific history offset */
    go(delta) { window.history.go(delta); },

    /** Register a before-navigation guard */
    beforeEach(fn) {
      beforeGuards.push(fn);
      return () => {
        const idx = beforeGuards.indexOf(fn);
        if (idx >= 0) beforeGuards.splice(idx, 1);
      };
    },

    /** Register an after-navigation hook */
    afterEach(fn) {
      afterHooks.push(fn);
      return () => {
        const idx = afterHooks.indexOf(fn);
        if (idx >= 0) afterHooks.splice(idx, 1);
      };
    },

    /** Subscribe to route changes */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Resolve a path to its route without navigating */
    resolve(path) {
      const loc = parsePath(path);
      const { route, params } = resolve(loc.pathname);
      return {
        path: loc.pathname,
        params,
        query: parseQuery(loc.search),
        meta: route ? (route.meta || {}) : {},
        component: route ? route.component : null,
        matched: !!route,
      };
    },

    /** Initialize the router (call once at app startup) */
    start() {
      if (mode === 'hash') {
        window.addEventListener('hashchange', handlePopState);
      } else {
        window.addEventListener('popstate', handlePopState);
      }
      // Initial route resolution
      const loc = getLocation();
      return navigate(loc.pathname + loc.search + (loc.hash || ''), true);
    },

    /** Clean up event listeners */
    destroy() {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
      listeners.clear();
      beforeGuards.length = 0;
      afterHooks.length = 0;
    },

    /** All configured routes */
    get routes() { return routes.map(r => ({ path: r.path, component: r.component, meta: r.meta })); },
  };

  return router;
}

// ============================================================
// Web Components: <chasket-router>, <chasket-route>, <chasket-link>
// ============================================================

/**
 * <chasket-router> — Root router container.
 *
 * Provides the router instance to child components via a
 * shared property. Must wrap <chasket-route> and <chasket-link>.
 *
 * Usage:
 *   const router = createRouter({ routes: [...] });
 *   document.querySelector('chasket-router').router = router;
 *   router.start();
 */
class ChasketRouter extends HTMLElement {
  #router = null;
  #unsubscribe = null;

  set router(r) {
    if (this.#unsubscribe) this.#unsubscribe();
    this.#router = r;
    this.#propagateRouter();
    this.#unsubscribe = r.subscribe(() => this.#onRouteChange());
  }

  get router() { return this.#router; }

  connectedCallback() {
    if (this.#router) this.#propagateRouter();
  }

  disconnectedCallback() {
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
  }

  #propagateRouter() {
    // Push router reference to <chasket-route> and <chasket-link> children
    this.querySelectorAll('chasket-route').forEach(el => { el._router = this.#router; });
    this.querySelectorAll('chasket-link').forEach(el => { el._router = this.#router; });
  }

  #onRouteChange() {
    this.querySelectorAll('chasket-route').forEach(el => el._render());
    this.querySelectorAll('chasket-link').forEach(el => el._updateActive());
  }
}

/**
 * <chasket-route> — Route outlet that renders the matched component.
 *
 * Renders the component matching the current route inside its shadow DOM.
 * Passes route params and query as attributes/properties to the rendered component.
 */
class ChasketRoute extends HTMLElement {
  _router = null;
  #shadow;
  #currentComponent = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this._router) this._render();
  }

  _render() {
    if (!this._router) return;

    const route = this._router.current;
    const componentTag = route.component;

    if (!componentTag) {
      this.#shadow.innerHTML = '';
      this.#currentComponent = null;
      return;
    }

    // Only re-create element if tag changed
    if (this.#currentComponent !== componentTag) {
      this.#shadow.innerHTML = '';
      const el = document.createElement(componentTag);
      this.#applyRouteData(el, route);
      this.#shadow.appendChild(el);
      this.#currentComponent = componentTag;
    } else {
      // Same component, update props
      const el = this.#shadow.firstElementChild;
      if (el) this.#applyRouteData(el, route);
    }
  }

  #applyRouteData(el, route) {
    // Set params as attributes (kebab-case) and properties
    if (route.params) {
      for (const [key, val] of Object.entries(route.params)) {
        el.setAttribute('route-' + key, val);
        // Also set as property for Chasket components (prop declarations)
        if (typeof el['route' + key.charAt(0).toUpperCase() + key.slice(1)] !== 'undefined' ||
            !el.hasOwnProperty('route' + key.charAt(0).toUpperCase() + key.slice(1))) {
          try { el['route-' + key] = val; } catch (e) { /* ignore */ }
        }
      }
    }
    // Set query as properties
    if (route.query) {
      try { el._routeQuery = route.query; } catch (e) { /* ignore */ }
    }
    // Set meta
    try { el._routeMeta = route.meta; } catch (e) { /* ignore */ }
  }
}

/**
 * <chasket-link> — Declarative navigation link.
 *
 * Renders an <a> tag that intercepts clicks for client-side navigation.
 * Adds 'active' class when the current route matches the link's target.
 *
 * Attributes:
 *   to="/path"         - Target path
 *   replace            - Use replaceState instead of pushState
 *   exact              - Only match exactly (default: prefix match)
 *   active-class="..."  - Custom active class name (default: "active")
 *
 * Usage:
 *   <chasket-link to="/about">About</chasket-link>
 *   <chasket-link to="/" exact>Home</chasket-link>
 */
class ChasketLink extends HTMLElement {
  _router = null;
  #shadow;

  static get observedAttributes() { return ['to', 'active-class', 'exact', 'replace']; }

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.innerHTML = `
      <style>
        :host { display: inline; }
        a { color: inherit; text-decoration: inherit; cursor: pointer; }
        a.active { font-weight: bold; }
        ::slotted(*) { }
      </style>
      <a part="link"><slot></slot></a>
    `;
    this.#shadow.querySelector('a').addEventListener('click', (e) => this.#onClick(e));
  }

  connectedCallback() {
    this._updateActive();
    this.#updateHref();
  }

  attributeChangedCallback() {
    this._updateActive();
    this.#updateHref();
  }

  #updateHref() {
    const a = this.#shadow.querySelector('a');
    if (a) a.href = this.getAttribute('to') || '/';
  }

  #onClick(e) {
    // Allow ctrl/cmd+click for new tab
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();

    const to = this.getAttribute('to') || '/';
    const replace = this.hasAttribute('replace');

    if (this._router) {
      if (replace) {
        this._router.replace(to);
      } else {
        this._router.push(to);
      }
    }
  }

  _updateActive() {
    if (!this._router) return;

    const to = this.getAttribute('to') || '/';
    const exact = this.hasAttribute('exact');
    const activeClass = this.getAttribute('active-class') || 'active';
    const currentPath = this._router.current.path;

    const a = this.#shadow.querySelector('a');
    if (!a) return;

    const isActive = exact
      ? currentPath === to
      : currentPath === to || currentPath.startsWith(to + '/');

    if (isActive) {
      a.classList.add(activeClass);
      this.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove(activeClass);
      this.removeAttribute('aria-current');
    }
  }
}

/**
 * Register all router custom elements.
 * Safe to call multiple times — idempotent.
 */
function registerRouterElements() {
  if (!customElements.get('chasket-router')) {
    customElements.define('chasket-router', ChasketRouter);
  }
  if (!customElements.get('chasket-route')) {
    customElements.define('chasket-route', ChasketRoute);
  }
  if (!customElements.get('chasket-link')) {
    customElements.define('chasket-link', ChasketLink);
  }
}

// Auto-register when loaded in browser
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  registerRouterElements();
}

export {
  createRouter,
  ChasketRouter,
  ChasketRoute,
  ChasketLink,
  registerRouterElements,
  // Internal utilities (for testing)
  compilePattern,
  matchRoute,
  parseQuery,
};

export default createRouter;
