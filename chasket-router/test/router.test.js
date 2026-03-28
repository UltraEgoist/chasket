const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createRouter,
  compilePattern,
  matchRoute,
  parseQuery,
} = require('../index.js');

// ============================================================
// compilePattern
// ============================================================

describe('compilePattern', () => {
  it('compiles a static path', () => {
    const c = compilePattern('/about');
    assert.deepEqual(c.paramNames, []);
    assert.equal(c.isWildcard, false);
    assert.ok(c.regex.test('/about'));
    assert.ok(!c.regex.test('/other'));
  });

  it('compiles a path with named parameter', () => {
    const c = compilePattern('/users/:id');
    assert.deepEqual(c.paramNames, ['id']);
    assert.ok(c.regex.test('/users/123'));
    assert.ok(!c.regex.test('/users/'));
  });

  it('compiles multiple parameters', () => {
    const c = compilePattern('/users/:id/posts/:postId');
    assert.deepEqual(c.paramNames, ['id', 'postId']);
    assert.ok(c.regex.test('/users/1/posts/42'));
  });

  it('compiles wildcard', () => {
    const c = compilePattern('*');
    assert.deepEqual(c.paramNames, ['*']);
    assert.equal(c.isWildcard, true);
    assert.ok(c.regex.test('/anything/here'));
  });

  it('compiles trailing wildcard', () => {
    const c = compilePattern('/files/*');
    assert.ok(c.regex.test('/files/a/b/c'));
    assert.ok(!c.regex.test('/other'));
  });

  it('compiles root path', () => {
    const c = compilePattern('/');
    assert.ok(c.regex.test('/'));
    assert.ok(!c.regex.test('/about'));
  });
});

// ============================================================
// matchRoute
// ============================================================

describe('matchRoute', () => {
  it('matches static path', () => {
    const c = compilePattern('/about');
    const r = matchRoute('/about', c);
    assert.equal(r.matched, true);
    assert.deepEqual(r.params, {});
  });

  it('does not match wrong path', () => {
    const c = compilePattern('/about');
    const r = matchRoute('/contact', c);
    assert.equal(r.matched, false);
  });

  it('extracts named parameter', () => {
    const c = compilePattern('/users/:id');
    const r = matchRoute('/users/42', c);
    assert.equal(r.matched, true);
    assert.equal(r.params.id, '42');
  });

  it('extracts multiple parameters', () => {
    const c = compilePattern('/users/:userId/posts/:postId');
    const r = matchRoute('/users/5/posts/99', c);
    assert.equal(r.matched, true);
    assert.equal(r.params.userId, '5');
    assert.equal(r.params.postId, '99');
  });

  it('decodes URI components', () => {
    const c = compilePattern('/search/:query');
    const r = matchRoute('/search/hello%20world', c);
    assert.equal(r.params.query, 'hello world');
  });

  it('matches wildcard and captures rest', () => {
    const c = compilePattern('/files/*');
    const r = matchRoute('/files/a/b/c.txt', c);
    assert.equal(r.matched, true);
    assert.equal(r.params['*'], 'a/b/c.txt');
  });
});

// ============================================================
// parseQuery
// ============================================================

describe('parseQuery', () => {
  it('parses empty query', () => {
    const q1 = parseQuery('');
    assert.equal(Object.keys(q1).length, 0);
    const q2 = parseQuery('?');
    assert.equal(Object.keys(q2).length, 0);
  });

  it('parses single key-value', () => {
    const q = parseQuery('?foo=bar');
    assert.equal(q.foo, 'bar');
    assert.equal(Object.keys(q).length, 1);
  });

  it('parses multiple key-values', () => {
    const q = parseQuery('?a=1&b=2&c=3');
    assert.equal(q.a, '1');
    assert.equal(q.b, '2');
    assert.equal(q.c, '3');
  });

  it('handles encoded values', () => {
    const q = parseQuery('?name=hello%20world&emoji=%F0%9F%94%A5');
    assert.equal(q.name, 'hello world');
  });

  it('handles value with equals sign', () => {
    const q = parseQuery('?expr=a%3Db');
    assert.equal(q.expr, 'a=b');
  });

  it('handles key without value', () => {
    const q = parseQuery('?flag');
    assert.equal(q.flag, '');
  });
});

// ============================================================
// createRouter
// ============================================================

describe('createRouter', () => {
  it('creates a router with routes', () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'x-home' },
        { path: '/about', component: 'x-about' },
      ],
    });
    assert.ok(router);
    assert.equal(router.routes.length, 2);
  });

  it('resolves a static route', () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'x-home' },
        { path: '/about', component: 'x-about' },
      ],
    });
    const r = router.resolve('/about');
    assert.equal(r.component, 'x-about');
    assert.equal(r.matched, true);
  });

  it('resolves route with params', () => {
    const router = createRouter({
      routes: [
        { path: '/users/:id', component: 'x-user' },
      ],
    });
    const r = router.resolve('/users/42');
    assert.equal(r.component, 'x-user');
    assert.equal(r.params.id, '42');
  });

  it('resolves with query string', () => {
    const router = createRouter({
      routes: [{ path: '/search', component: 'x-search' }],
    });
    const r = router.resolve('/search?q=hello&page=2');
    assert.equal(r.component, 'x-search');
    assert.equal(r.query.q, 'hello');
    assert.equal(r.query.page, '2');
  });

  it('resolves wildcard (catch-all)', () => {
    const router = createRouter({
      routes: [
        { path: '/', component: 'x-home' },
        { path: '*', component: 'x-404' },
      ],
    });
    const r = router.resolve('/nonexistent');
    assert.equal(r.component, 'x-404');
  });

  it('returns unmatched for no matching route', () => {
    const router = createRouter({
      routes: [{ path: '/', component: 'x-home' }],
    });
    const r = router.resolve('/nonexistent');
    assert.equal(r.matched, false);
    assert.equal(r.component, null);
  });

  it('includes route meta', () => {
    const router = createRouter({
      routes: [
        { path: '/admin', component: 'x-admin', meta: { requiresAuth: true } },
      ],
    });
    const r = router.resolve('/admin');
    assert.equal(r.meta.requiresAuth, true);
  });

  it('supports before guard registration', () => {
    const router = createRouter({ routes: [] });
    const unsub = router.beforeEach(() => true);
    assert.equal(typeof unsub, 'function');
    unsub(); // should not throw
  });

  it('supports after hook registration', () => {
    const router = createRouter({ routes: [] });
    const unsub = router.afterEach(() => {});
    assert.equal(typeof unsub, 'function');
    unsub();
  });

  it('supports subscribe', () => {
    const router = createRouter({ routes: [] });
    const unsub = router.subscribe(() => {});
    assert.equal(typeof unsub, 'function');
    unsub();
  });

  it('initial current route is default', () => {
    const router = createRouter({
      routes: [{ path: '/', component: 'x-home' }],
    });
    assert.equal(router.current.path, '/');
  });

  it('destroy does not throw', () => {
    const router = createRouter({ routes: [] });
    router.destroy(); // should not throw
  });

  it('resolves nested children routes', () => {
    const router = createRouter({
      routes: [
        {
          path: '/settings',
          component: 'x-settings',
          children: [
            { path: '/profile', component: 'x-profile' },
            { path: '/security', component: 'x-security' },
          ],
        },
      ],
    });
    const r = router.resolve('/settings/profile');
    assert.equal(r.component, 'x-profile');
    assert.equal(r.matched, true);
  });

  it('resolves base path correctly', () => {
    const router = createRouter({
      base: '/app',
      routes: [
        { path: '/', component: 'x-home' },
        { path: '/about', component: 'x-about' },
      ],
    });
    const r = router.resolve('/about');
    assert.equal(r.component, 'x-about');
  });
});

// ============================================================
// Security: Path validation
// ============================================================

describe('createRouter - security', () => {
  it('should block javascript: URLs', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'x-home' }] });
    const result = await router.push('javascript:alert(1)');
    assert.equal(result, false);
  });

  it('should block data: URLs', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'x-home' }] });
    const result = await router.push('data:text/html,<h1>XSS</h1>');
    assert.equal(result, false);
  });

  it('should block protocol-relative URLs', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'x-home' }] });
    const result = await router.push('//attacker.com/phishing');
    assert.equal(result, false);
  });

  it('should block vbscript: URLs', async () => {
    const router = createRouter({ routes: [{ path: '/', component: 'x-home' }] });
    const result = await router.push('vbscript:MsgBox("XSS")');
    assert.equal(result, false);
  });

  it('should allow normal relative paths', async () => {
    const router = createRouter({ routes: [{ path: '/about', component: 'x-about' }] });
    const result = await router.push('/about');
    assert.notEqual(result, false);
  });
});
