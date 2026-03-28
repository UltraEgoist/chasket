# State Store

`chasket-store` は Chasket アプリケーション用の軽量な状態管理ライブラリです。Flux パターンをベースに、Undo/Redo、ミドルウェア、セレクター購読を提供します。

## 基本的な使い方

```javascript
const { createStore } = require('@aspect/chasket-store');

const useCounter = createStore({
  state: { count: 0, name: 'Counter' },
  actions: {
    increment(state) { return { ...state, count: state.count + 1 }; },
    decrement(state) { return { ...state, count: state.count - 1 }; },
    addAmount(state, amount) { return { ...state, count: state.count + amount }; },
  },
  getters: {
    doubled(state) { return state.count * 2; },
    display(state) { return `${state.name}: ${state.count}`; },
  },
});

const store = useCounter();
store.dispatch('increment');
console.log(store.getState()); // { count: 1, name: 'Counter' }
console.log(store.get('doubled')); // 2
```

## Actions

アクションは現在の state と payload を受け取り、新しい state を返す純粋関数です。

```javascript
actions: {
  setName(state, name) {
    return { ...state, name };
  },
  addItem(state, item) {
    return { ...state, items: [...state.items, item] };
  },
  removeItem(state, index) {
    return { ...state, items: state.items.filter((_, i) => i !== index) };
  },
}
```

## Getters

Getter はstate から派生値を計算します。

```javascript
getters: {
  totalPrice(state) {
    return state.items.reduce((sum, item) => sum + item.price, 0);
  },
  itemCount(state) {
    return state.items.length;
  },
}

store.get('totalPrice'); // 計算結果
```

## Subscribe（購読）

state の変更を通知します。

```javascript
const unsubscribe = store.subscribe((newState, oldState) => {
  console.log('State changed:', newState);
});

// 購読解除
unsubscribe();
```

## Select（セレクター購読）

state の特定部分のみを監視します。値が変更された場合のみコールバックが実行されます。

```javascript
store.select(
  (state) => state.count,
  (count) => {
    document.getElementById('counter').textContent = count;
  }
);
```

## Batch（バッチ更新）

複数のアクションをまとめて実行し、通知は一度だけ発火します。

```javascript
store.batch(() => {
  store.dispatch('addItem', { name: 'A', price: 100 });
  store.dispatch('addItem', { name: 'B', price: 200 });
  store.dispatch('addItem', { name: 'C', price: 300 });
});
// subscribe は 1 回だけ呼ばれる
```

## Undo / Redo

```javascript
const useStore = createStore({
  state: { text: '' },
  actions: {
    setText(state, text) { return { ...state, text }; },
  },
  enableHistory: true,
  maxHistory: 50,
});

const store = useStore();
store.dispatch('setText', 'Hello');
store.dispatch('setText', 'World');
store.undo();  // { text: 'Hello' }
store.redo();  // { text: 'World' }
```

## Middleware

ミドルウェアはアクションの前後に処理を挿入します。

### Logger

```javascript
const { loggerMiddleware } = require('@aspect/chasket-store');

const useStore = createStore({
  state: { count: 0 },
  actions: { inc(s) { return { count: s.count + 1 }; } },
  middleware: [loggerMiddleware],
});
```

### Freeze（不変性強制）

```javascript
const { freezeMiddleware } = require('@aspect/chasket-store');

const useStore = createStore({
  state: { count: 0 },
  actions: { inc(s) { return { count: s.count + 1 }; } },
  middleware: [freezeMiddleware],
});

// dispatch 後の state は Object.freeze() される
```

### Persist（永続化）

```javascript
const { persistMiddleware } = require('@aspect/chasket-store');

const useStore = createStore({
  state: { theme: 'light' },
  actions: { setTheme(s, t) { return { ...s, theme: t }; } },
  middleware: [persistMiddleware('my-app-state')],
});
```

### カスタムミドルウェア

```javascript
function myMiddleware(store) {
  return (action, payload, next) => {
    console.log('Before:', action);
    const result = next(action, payload);
    console.log('After:', store.getState());
    return result;
  };
}
```

## combineStores

複数のストアを統合します。

```javascript
const { combineStores } = require('@aspect/chasket-store');

const useAuth = createStore({ ... });
const useCart = createStore({ ... });

const combined = combineStores({ auth: useAuth, cart: useCart });
const store = combined();

store.dispatch('auth', 'login', credentials);
store.dispatch('cart', 'addItem', item);
```

## セキュリティ

- `deepClone` はプロトタイプ汚染を防止します（`__proto__`、`constructor`、`prototype` キーをスキップ）
- dispatch 結果は自動的に `deepClone` でサニタイズされます（frozen オブジェクトを除く）
- 循環参照は検出されて `null` に置換されます
