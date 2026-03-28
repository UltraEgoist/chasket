# Router

`chasket-router` は Chasket SPA アプリケーション用のクライアントサイドルーターです。ハッシュモードとヒストリーモードをサポートし、ナビゲーションガードによるルート制御が可能です。

## 基本的な使い方

```javascript
const { createRouter } = require('@aspect/chasket-router');

const router = createRouter({
  mode: 'history',   // 'history' | 'hash'
  routes: [
    { path: '/', component: 'x-home' },
    { path: '/about', component: 'x-about' },
    { path: '/users/:id', component: 'x-user-detail' },
    { path: '*', component: 'x-not-found' },
  ],
});

router.start();
```

## ルート定義

### 静的ルート

```javascript
{ path: '/about', component: 'x-about' }
```

### 動的パラメータ

```javascript
{ path: '/users/:id', component: 'x-user-detail' }
// /users/42 → params: { id: '42' }
```

### ワイルドカード（404）

```javascript
{ path: '*', component: 'x-not-found' }
```

### ネストルート

```javascript
{
  path: '/admin',
  component: 'x-admin',
  children: [
    { path: '/users', component: 'x-admin-users' },
    { path: '/settings', component: 'x-admin-settings' },
  ],
}
```

### メタデータ

```javascript
{
  path: '/dashboard',
  component: 'x-dashboard',
  meta: { requiresAuth: true },
}
```

## ナビゲーション

```javascript
router.push('/about');
router.push('/users/42?tab=posts#top');
router.replace('/login');
router.back();
router.forward();
router.go(-2);
```

## ナビゲーションガード

### beforeEach

ルート遷移前に実行されます。`false` を返すとナビゲーションをキャンセルします。

```javascript
router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    return '/login';  // リダイレクト
  }
  return true;  // 許可
});
```

### afterEach

ルート遷移後に実行されます。

```javascript
router.afterEach((to, from) => {
  document.title = to.meta.title || 'My App';
});
```

## ルート購読

```javascript
const unsubscribe = router.subscribe((current, previous) => {
  console.log(`${previous.path} → ${current.path}`);
  renderComponent(current.component);
});

// 購読解除
unsubscribe();
```

## 現在のルート

```javascript
const route = router.current;
// { path, params, query, meta, component, hash, matched }
```

## ルート解決

```javascript
const result = router.resolve('/users/42?sort=name');
// { path: '/users/42', params: { id: '42' }, query: { sort: 'name' }, ... }
```

## セキュリティ

ルーターは以下のURL攻撃を自動ブロックします:

- `javascript:` プロトコル
- `data:` プロトコル
- `vbscript:` プロトコル
- プロトコル相対URL（`//attacker.com`）
- 制御文字によるバイパス（タブ、改行等）

クエリパラメータのパースでは `__proto__` / `constructor` / `prototype` キーがフィルタされ、プロトタイプ汚染を防止します。

## ハッシュモード

```javascript
const router = createRouter({
  mode: 'hash',
  routes: [...],
});
```

URL例: `http://example.com/#/about`

サーバー設定不要で動作します。

## ヒストリーモード

```javascript
const router = createRouter({
  mode: 'history',
  routes: [...],
});
```

URL例: `http://example.com/about`

サーバー側でフォールバック設定が必要です（全パスで `index.html` を返す）。
