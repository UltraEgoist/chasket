# @aspect/chasket-router API Reference

Client-side SPA router for Chasket applications. History API ベースのルーティングを提供します。

## Installation

```bash
npm install @aspect/chasket-router
```

## Quick Start

```javascript
import { createRouter } from '@aspect/chasket-router';

const router = createRouter({
  routes: [
    { path: '/', component: 'x-home' },
    { path: '/users/:id', component: 'x-user-detail', meta: { auth: true } },
    { path: '/about', component: 'x-about' },
    { path: '*', component: 'x-not-found' }
  ]
});

document.querySelector('chasket-router').router = router;
router.start();
```

```html
<chasket-router>
  <chasket-link to="/">Home</chasket-link>
  <chasket-link to="/about">About</chasket-link>
  <chasket-route></chasket-route>
</chasket-router>
```

---

## createRouter(options)

ルーターインスタンスを生成します。

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.routes` | `RouteConfig[]` | `[]` | ルート定義の配列 |
| `options.mode` | `'history' \| 'hash'` | `'history'` | ルーティングモード |
| `options.base` | `string` | `''` | ベースパスのプレフィックス |

### RouteConfig

```typescript
interface RouteConfig {
  path: string;        // ルートパターン（例: '/users/:id'）
  component: string;   // カスタム要素のタグ名
  meta?: object;       // 任意のメタデータ
  children?: RouteConfig[];  // ネストされた子ルート
}
```

### Path Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| Static | `/about` | 完全一致 |
| Named param | `/users/:id` | 動的パラメータ（`params.id` で取得） |
| Wildcard | `/files/*` | 残りの全パスをキャプチャ |
| Nested | `/users/:id/posts` | 複数セグメント |

### Returns: `RouterInstance`

---

## RouterInstance

### Properties

#### `router.current`

現在のルート情報を取得します（読み取り専用）。

```typescript
interface RouteState {
  path: string;        // 現在のパス
  params: object;      // 動的パラメータ
  query: object;       // クエリパラメータ
  meta: object;        // ルートメタデータ
  component: string | null;  // マッチしたコンポーネント名
  hash: string;        // ハッシュフラグメント
  matched: boolean;    // ルートがマッチしたか
}
```

```javascript
console.log(router.current.path);      // '/users/42'
console.log(router.current.params.id); // '42'
console.log(router.current.query);     // { tab: 'posts' }
```

#### `router.routes`

設定された全ルートの一覧を取得します。

```javascript
router.routes; // [{ path: '/', component: 'x-home', meta: {} }, ...]
```

### Navigation Methods

#### `router.push(to: string): Promise<boolean>`

新しいパスにナビゲートし、ブラウザ履歴にエントリを追加します。

```javascript
await router.push('/users/42');
await router.push('/search?q=chasket&page=2');
await router.push('/docs#getting-started');
```

**Returns:** ナビゲーションが成功した場合 `true`、ガードにより中止された場合 `false`。

#### `router.replace(to: string): Promise<boolean>`

現在の履歴エントリを置換してナビゲートします（戻るボタンで戻れない）。

```javascript
await router.replace('/login'); // 履歴に残さず遷移
```

#### `router.back()`

ブラウザ履歴を1つ戻ります。`window.history.back()` と同等です。

#### `router.forward()`

ブラウザ履歴を1つ進めます。

#### `router.go(delta: number)`

指定したオフセット分だけ履歴を移動します。

```javascript
router.go(-2); // 2つ前に戻る
```

### Navigation Guards

#### `router.beforeEach(guard): unsubscribe`

ナビゲーション前に実行されるガード関数を登録します。

```javascript
const removeGuard = router.beforeEach(async (to, from) => {
  // false を返すとナビゲーションをキャンセル
  if (to.meta.auth && !isLoggedIn()) return false;

  // 文字列を返すとリダイレクト
  if (to.path === '/old-page') return '/new-page';

  // undefined / true を返すと通過
});

removeGuard(); // ガードを解除
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `to` | `RouteState` | 遷移先のルート情報 |
| `from` | `RouteState` | 遷移元のルート情報 |

**Returns:** `false`（キャンセル）、`string`（リダイレクト先）、または `undefined`（通過）

#### `router.afterEach(hook): unsubscribe`

ナビゲーション完了後に実行されるフック関数を登録します。

```javascript
const removeHook = router.afterEach((to, from) => {
  document.title = to.meta.title || 'Chasket App';
  analytics.pageView(to.path);
});
```

### Subscription

#### `router.subscribe(callback): unsubscribe`

ルート変更時に呼ばれるコールバックを登録します。

```javascript
const unsub = router.subscribe((current, previous) => {
  console.log(`${previous.path} → ${current.path}`);
});

unsub(); // 購読解除
```

### Utility Methods

#### `router.resolve(path: string): RouteState`

実際にナビゲートせずに、パスに対するルート解決結果を取得します。

```javascript
const result = router.resolve('/users/42?tab=posts');
console.log(result.params);    // { id: '42' }
console.log(result.component); // 'x-user-detail'
console.log(result.matched);   // true
```

#### `router.start(): Promise<boolean>`

ルーターを初期化し、現在の URL に基づいて最初のルート解決を実行します。アプリ起動時に1回だけ呼び出してください。

#### `router.destroy()`

イベントリスナーを解除し、リソースをクリーンアップします。

---

## Web Components

### `<chasket-router>`

ルーターのルートコンテナ。`<chasket-route>` と `<chasket-link>` を内包する必要があります。

```html
<chasket-router>
  <!-- ナビゲーションリンクやルートアウトレットをここに配置 -->
</chasket-router>
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `router` | `RouterInstance` | ルーターインスタンスをセット |

```javascript
const el = document.querySelector('chasket-router');
el.router = createRouter({ routes: [...] });
```

### `<chasket-route>`

現在のルートにマッチするコンポーネントをレンダリングするアウトレットです。Shadow DOM 内にマッチしたコンポーネントを動的に生成します。

ルートパラメータは `route-*` 属性とプロパティとして子コンポーネントに渡されます。

```html
<chasket-route></chasket-route>
```

**Passed to child component:**

| Property | Description |
|----------|-------------|
| `route-{param}` | ルートパラメータ（属性 + プロパティ） |
| `_routeQuery` | クエリパラメータオブジェクト |
| `_routeMeta` | ルートメタデータ |

### `<chasket-link>`

クライアントサイドナビゲーションを行うリンクコンポーネントです。内部的に `<a>` タグをレンダリングし、クリックをインターセプトします。

```html
<chasket-link to="/about">About</chasket-link>
<chasket-link to="/" exact>Home</chasket-link>
<chasket-link to="/dashboard" replace active-class="current">Dashboard</chasket-link>
```

**Attributes:**

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `to` | `string` | `'/'` | ナビゲーション先パス |
| `exact` | `boolean` | `false` | 完全一致でのみアクティブ状態にする |
| `replace` | `boolean` | `false` | `pushState` の代わりに `replaceState` を使用 |
| `active-class` | `string` | `'active'` | アクティブ時に付与する CSS クラス名 |

**Styling (CSS Parts):**

```css
chasket-link::part(link) {
  color: #3b82f6;
  text-decoration: none;
}
```

Ctrl+Click / Cmd+Click は通常通り新しいタブで開きます。

---

## Utility Functions

### `compilePattern(pattern: string)`

ルートパターンを正規表現にコンパイルします（内部利用）。

```javascript
const compiled = compilePattern('/users/:id');
// { regex: /^\/users\/([^/]+)$/, paramNames: ['id'], isWildcard: false }
```

### `matchRoute(pathname: string, compiled)`

コンパイル済みパターンに対してパス名をマッチングします。

```javascript
const { matched, params } = matchRoute('/users/42', compiled);
// { matched: true, params: { id: '42' } }
```

### `parseQuery(search: string)`

クエリ文字列をオブジェクトに変換します。

```javascript
parseQuery('?name=chasket&version=1.0');
// { name: 'chasket', version: '1.0' }
```
