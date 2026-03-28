# @aspect/chasket-store API Reference

Chasket アプリケーション向けのリアクティブ状態管理ライブラリ。Flux パターンに基づき、型付きアクション、セレクタ、ミドルウェア、タイムトラベルデバッグを提供します。

## Installation

```bash
npm install @aspect/chasket-store
```

## Quick Start

```javascript
import { createStore } from '@aspect/chasket-store';

const useCounter = createStore({
  name: 'counter',
  state: { count: 0 },
  actions: {
    increment(state) { return { ...state, count: state.count + 1 }; },
    add(state, amount) { return { ...state, count: state.count + amount }; },
  },
  getters: {
    doubled(state) { return state.count * 2; },
    isPositive(state) { return state.count > 0; },
  }
});

// コンポーネント内で使用
const counter = useCounter();
counter.dispatch('increment');
console.log(counter.getState().count); // 1
console.log(counter.get('doubled'));   // 2
```

---

## createStore(definition)

ストアを生成し、フック関数として返します。

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `definition.state` | `object` | (required) | 初期状態オブジェクト |
| `definition.actions` | `Record<string, Function>` | `{}` | 状態変更関数のマップ |
| `definition.getters` | `Record<string, Function>` | `{}` | 派生値の計算関数マップ |
| `definition.middleware` | `Function[]` | `[]` | ミドルウェア関数の配列 |
| `definition.name` | `string` | `'chasket-store'` | ストア名（デバッグ・永続化用） |

### Actions

アクション関数は現在の state と payload を受け取り、新しい state オブジェクトを返します。イミュータブルな更新が必要です。

```javascript
actions: {
  // payload なし
  increment(state) {
    return { ...state, count: state.count + 1 };
  },
  // payload あり
  addItem(state, item) {
    return { ...state, items: [...state.items, item] };
  },
  // オブジェクト payload
  updateUser(state, { name, email }) {
    return { ...state, user: { ...state.user, name, email } };
  }
}
```

### Getters

ゲッター関数は state を受け取り、派生値を返します。

```javascript
getters: {
  totalPrice(state) {
    return state.items.reduce((sum, item) => sum + item.price, 0);
  },
  activeItems(state) {
    return state.items.filter(item => item.active);
  }
}
```

### Returns: `useStore` (Hook Function)

`useStore()` を呼び出すとシングルトンのストアインスタンスを返します。どのコンポーネントから呼んでも同じインスタンスが返されます。

```javascript
const useAuth = createStore({ ... });

// 以下は全て同じストアインスタンス
const store1 = useAuth();
const store2 = useAuth();
console.log(store1 === store2); // true
```

---

## Store Instance Methods

### State Access

#### `store.getState(): object`

現在の状態のスナップショットを取得します。

```javascript
const state = store.getState();
console.log(state.count);
```

### Dispatching Actions

#### `store.dispatch(actionName: string, payload?: any): object`

名前付きアクションを実行し、状態を更新します。

```javascript
store.dispatch('increment');
store.dispatch('add', 5);
store.dispatch('updateUser', { name: 'Alice', email: 'alice@example.com' });
```

**Throws:** 未定義のアクション名を指定すると `Error` をスローします。

**Returns:** 更新後の状態オブジェクト。

### Computed Values

#### `store.get(getterName: string): any`

ゲッター関数を実行し、派生値を取得します。

```javascript
const total = store.get('totalPrice');
const active = store.get('activeItems');
```

**Throws:** 未定義のゲッター名を指定すると `Error` をスローします。

### Subscriptions

#### `store.subscribe(callback: Function): unsubscribe`

全ての状態変更時に呼ばれるコールバックを登録します。

```javascript
const unsub = store.subscribe((state) => {
  console.log('State changed:', state);
  renderUI(state);
});

unsub(); // 購読解除
```

#### `store.select(selector: Function, callback: Function): unsubscribe`

状態の特定のスライスを監視し、そのスライスが変更されたときのみコールバックを実行します（浅い比較）。

```javascript
// count が変わったときだけ発火
const unsub = store.select(
  state => state.count,
  (newCount) => {
    document.getElementById('counter').textContent = newCount;
  }
);
```

パフォーマンス最適化に有効です。ストア全体の変更ではなく、関心のある部分のみを監視できます。

### Batch Updates

#### `store.batch(fn: Function): void`

複数の dispatch をグループ化し、通知を1回にまとめます。

```javascript
store.batch(() => {
  store.dispatch('setName', 'Alice');
  store.dispatch('setEmail', 'alice@example.com');
  store.dispatch('setAge', 30);
  // ここまで subscriber への通知は発生しない
});
// batch 終了時に1回だけ通知
```

ネストした batch にも対応しています。最も外側の batch が完了したときに通知されます。

### Time Travel (Undo / Redo)

#### `store.undo(): boolean`

直前のアクションを取り消します。成功時は `true`、履歴の先頭にいる場合は `false` を返します。

#### `store.redo(): boolean`

取り消したアクションをやり直します。成功時は `true`、履歴の末尾にいる場合は `false` を返します。

#### `store.canUndo: boolean` (getter)

undo 可能かどうかを返します。

#### `store.canRedo: boolean` (getter)

redo 可能かどうかを返します。

```javascript
store.dispatch('increment'); // count: 1
store.dispatch('increment'); // count: 2
store.undo();                // count: 1
store.redo();                // count: 2
```

履歴は最大 100 エントリまで保持されます（超過分は古い方から削除）。

### State Management

#### `store.setState(newState: object): void`

状態全体を置換します。ハイドレーション、DevTools からの状態復元などに使用します。

```javascript
store.setState({ count: 100, items: [] });
```

#### `store.reset(): void`

状態を初期値にリセットし、履歴をクリアします。

```javascript
store.reset();
```

### Metadata

#### `store.name: string` (getter)

ストア名を返します。

#### `store.actionNames: string[]` (getter)

利用可能なアクション名の一覧を返します。

#### `store.getterNames: string[]` (getter)

利用可能なゲッター名の一覧を返します。

### Cleanup

#### `store.destroy(): void`

全ての購読を解除し、履歴をクリアします。コンポーネントのアンマウント時に呼び出してください。

---

## Built-in Middleware

### `loggerMiddleware`

dispatch されたアクションと状態変更をコンソールにログ出力します。

```javascript
import { createStore, loggerMiddleware } from '@aspect/chasket-store';

const useApp = createStore({
  state: { count: 0 },
  actions: { increment(s) { return { ...s, count: s.count + 1 }; } },
  middleware: [loggerMiddleware],
});
```

出力例:
```
▸ [counter] increment
  prev: { count: 0 }
  payload: undefined
  next: { count: 1 }
```

### `persistMiddleware(key, options?)`

状態を `localStorage` に自動保存するミドルウェアを生成します。

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | (required) | localStorage のキー |
| `options.serialize` | `Function` | `JSON.stringify` | シリアライズ関数 |
| `options.deserialize` | `Function` | `JSON.parse` | デシリアライズ関数 |

```javascript
import { createStore, persistMiddleware, loadPersistedState } from '@aspect/chasket-store';

const STORAGE_KEY = 'app-settings';

const useSettings = createStore({
  state: loadPersistedState(STORAGE_KEY, { theme: 'light', lang: 'ja' }),
  actions: {
    setTheme(state, theme) { return { ...state, theme }; },
  },
  middleware: [persistMiddleware(STORAGE_KEY)],
});
```

### `loadPersistedState(key, fallback)`

`localStorage` から保存された状態を読み込みます。ストアの初期状態のハイドレーションに使用します。

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | localStorage のキー |
| `fallback` | `object` | 保存データがない場合のデフォルト値 |

### `freezeMiddleware`

アクション実行後に状態を `Object.freeze()` で凍結します。開発時のミュータビリティチェックに使用します。

```javascript
const useApp = createStore({
  state: { count: 0 },
  actions: { ... },
  middleware: [freezeMiddleware], // 本番では外す
});

const state = useApp().getState();
state.count = 99; // TypeError in strict mode / silent failure
Object.isFrozen(state); // true
```

---

## combineStores(stores)

複数のストアを名前空間付きで統合します。

```javascript
import { createStore, combineStores } from '@aspect/chasket-store';

const useAuth = createStore({ name: 'auth', state: { user: null }, ... });
const useCart = createStore({ name: 'cart', state: { items: [] }, ... });

const root = combineStores({ auth: useAuth, cart: useCart });

root.getState();                    // { auth: { user: null }, cart: { items: [] } }
root.dispatch('cart', 'addItem', item);
root.get('cart', 'totalPrice');
root.subscribe((combinedState) => { ... });
root.reset();                       // 全ストアをリセット
root.destroy();                     // 全ストアを破棄
```

### Combined Store API

| Method | Description |
|--------|-------------|
| `getState()` | 全ストアの状態を名前空間付きオブジェクトとして取得 |
| `dispatch(namespace, action, payload?)` | 指定名前空間のストアにアクションをディスパッチ |
| `get(namespace, getter)` | 指定名前空間のゲッター値を取得 |
| `subscribe(callback)` | いずれかのストアが変更されたときに通知 |
| `reset()` | 全ストアを初期状態にリセット |
| `destroy()` | 全ストアを破棄 |

---

## Custom Middleware

ミドルウェアは以下のシグネチャの関数です:

```javascript
function myMiddleware({ state, actionName, payload, dispatch, storeName }) {
  // dispatch を呼び出して次のミドルウェア（または実際のアクション）を実行
  const newState = dispatch(state);

  // newState を加工して返すことも可能
  return newState;
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `object` | dispatch 呼び出し時の現在の状態 |
| `actionName` | `string` | 実行中のアクション名 |
| `payload` | `any` | アクションに渡された引数 |
| `dispatch` | `Function` | 次のミドルウェアを呼び出す関数 |
| `storeName` | `string` | ストア名 |

ミドルウェアは定義順に実行され、最後に実際のアクション関数が呼ばれます。
