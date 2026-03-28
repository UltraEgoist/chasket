const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createStore,
  combineStores,
  freezeMiddleware,
} = require('../index.js');

// ============================================================
// createStore basics
// ============================================================

describe('createStore', () => {
  it('creates a store with initial state', () => {
    const useCounter = createStore({ state: { count: 0 } });
    const store = useCounter();
    assert.deepEqual(store.getState(), { count: 0 });
  });

  it('returns the same singleton instance', () => {
    const useStore = createStore({ state: { x: 1 } });
    assert.strictEqual(useStore(), useStore());
  });

  it('exposes state via shorthand', () => {
    const useStore = createStore({ state: { val: 42 } });
    assert.deepEqual(useStore.state, { val: 42 });
  });
});

// ============================================================
// Actions
// ============================================================

describe('actions', () => {
  it('dispatches an action to update state', () => {
    const useCounter = createStore({
      state: { count: 0 },
      actions: {
        increment(state) { return { ...state, count: state.count + 1 }; },
      },
    });
    const store = useCounter();
    store.dispatch('increment');
    assert.equal(store.getState().count, 1);
  });

  it('passes payload to action', () => {
    const useCounter = createStore({
      state: { count: 0 },
      actions: {
        add(state, amount) { return { ...state, count: state.count + amount }; },
      },
    });
    const store = useCounter();
    store.dispatch('add', 5);
    assert.equal(store.getState().count, 5);
  });

  it('throws on unknown action', () => {
    const useStore = createStore({ state: {} });
    assert.throws(() => useStore().dispatch('nonexistent'), /Unknown action/);
  });

  it('does not notify if action returns same state', () => {
    let calls = 0;
    const useStore = createStore({
      state: { x: 1 },
      actions: {
        noop(state) { return state; },
      },
    });
    const store = useStore();
    store.subscribe(() => calls++);
    store.dispatch('noop');
    assert.equal(calls, 0);
  });

  it('returns action names', () => {
    const useStore = createStore({
      state: {},
      actions: { a() {}, b() {} },
    });
    assert.deepEqual(useStore().actionNames, ['a', 'b']);
  });
});

// ============================================================
// Getters
// ============================================================

describe('getters', () => {
  it('computes derived state', () => {
    const useStore = createStore({
      state: { count: 5 },
      getters: {
        doubled(state) { return state.count * 2; },
      },
    });
    assert.equal(useStore().get('doubled'), 10);
  });

  it('reflects current state after dispatch', () => {
    const useStore = createStore({
      state: { items: ['a', 'b'] },
      actions: {
        addItem(state, item) { return { ...state, items: [...state.items, item] }; },
      },
      getters: {
        count(state) { return state.items.length; },
      },
    });
    const store = useStore();
    store.dispatch('addItem', 'c');
    assert.equal(store.get('count'), 3);
  });

  it('throws on unknown getter', () => {
    const useStore = createStore({ state: {} });
    assert.throws(() => useStore().get('nope'), /Unknown getter/);
  });

  it('returns getter names', () => {
    const useStore = createStore({
      state: {},
      getters: { a() {}, b() {} },
    });
    assert.deepEqual(useStore().getterNames, ['a', 'b']);
  });
});

// ============================================================
// Subscriptions
// ============================================================

describe('subscribe', () => {
  it('fires on state change', () => {
    const received = [];
    const useStore = createStore({
      state: { v: 0 },
      actions: { inc(s) { return { v: s.v + 1 }; } },
    });
    const store = useStore();
    store.subscribe(s => received.push(s.v));
    store.dispatch('inc');
    store.dispatch('inc');
    assert.deepEqual(received, [1, 2]);
  });

  it('unsubscribes correctly', () => {
    let calls = 0;
    const useStore = createStore({
      state: { x: 0 },
      actions: { inc(s) { return { x: s.x + 1 }; } },
    });
    const store = useStore();
    const unsub = store.subscribe(() => calls++);
    store.dispatch('inc');
    assert.equal(calls, 1);
    unsub();
    store.dispatch('inc');
    assert.equal(calls, 1); // no more calls
  });
});

// ============================================================
// Selector subscriptions
// ============================================================

describe('select', () => {
  it('fires only when selected value changes', () => {
    const received = [];
    const useStore = createStore({
      state: { a: 1, b: 10 },
      actions: {
        incA(s) { return { ...s, a: s.a + 1 }; },
        incB(s) { return { ...s, b: s.b + 1 }; },
      },
    });
    const store = useStore();
    store.select(s => s.a, val => received.push(val));
    store.dispatch('incB'); // b changed, a didn't
    assert.equal(received.length, 0);
    store.dispatch('incA'); // a changed
    assert.deepEqual(received, [2]);
  });

  it('unsubscribes selector correctly', () => {
    const received = [];
    const useStore = createStore({
      state: { x: 0 },
      actions: { inc(s) { return { x: s.x + 1 }; } },
    });
    const store = useStore();
    const unsub = store.select(s => s.x, v => received.push(v));
    store.dispatch('inc');
    assert.deepEqual(received, [1]);
    unsub();
    store.dispatch('inc');
    assert.deepEqual(received, [1]); // no more
  });
});

// ============================================================
// Batch
// ============================================================

describe('batch', () => {
  it('only notifies once after batch', () => {
    let calls = 0;
    const useStore = createStore({
      state: { x: 0 },
      actions: { inc(s) { return { x: s.x + 1 }; } },
    });
    const store = useStore();
    store.subscribe(() => calls++);
    store.batch(() => {
      store.dispatch('inc');
      store.dispatch('inc');
      store.dispatch('inc');
    });
    assert.equal(calls, 1); // single notification
    assert.equal(store.getState().x, 3);
  });
});

// ============================================================
// Time-travel (undo / redo)
// ============================================================

describe('undo/redo', () => {
  it('undoes the last action', () => {
    const useStore = createStore({
      state: { count: 0 },
      actions: { inc(s) { return { count: s.count + 1 }; } },
    });
    const store = useStore();
    store.dispatch('inc');
    store.dispatch('inc');
    assert.equal(store.getState().count, 2);
    assert.equal(store.canUndo, true);
    store.undo();
    assert.equal(store.getState().count, 1);
    store.undo();
    assert.equal(store.getState().count, 0);
    assert.equal(store.canUndo, false);
  });

  it('redoes an undone action', () => {
    const useStore = createStore({
      state: { count: 0 },
      actions: { inc(s) { return { count: s.count + 1 }; } },
    });
    const store = useStore();
    store.dispatch('inc');
    store.dispatch('inc');
    store.undo();
    assert.equal(store.canRedo, true);
    store.redo();
    assert.equal(store.getState().count, 2);
    assert.equal(store.canRedo, false);
  });

  it('new dispatch after undo clears redo history', () => {
    const useStore = createStore({
      state: { v: 0 },
      actions: {
        set(s, n) { return { v: n }; },
      },
    });
    const store = useStore();
    store.dispatch('set', 1);
    store.dispatch('set', 2);
    store.undo(); // v=1
    store.dispatch('set', 3); // new branch
    assert.equal(store.canRedo, false);
    assert.equal(store.getState().v, 3);
  });
});

// ============================================================
// setState / reset
// ============================================================

describe('setState / reset', () => {
  it('replaces state entirely', () => {
    const useStore = createStore({ state: { a: 1 } });
    const store = useStore();
    store.setState({ a: 99 });
    assert.equal(store.getState().a, 99);
  });

  it('resets to initial state', () => {
    const useStore = createStore({
      state: { count: 0 },
      actions: { inc(s) { return { count: s.count + 1 }; } },
    });
    const store = useStore();
    store.dispatch('inc');
    store.dispatch('inc');
    store.reset();
    assert.equal(store.getState().count, 0);
  });

  it('setState notifies subscribers', () => {
    let called = false;
    const useStore = createStore({ state: { x: 0 } });
    const store = useStore();
    store.subscribe(() => { called = true; });
    store.setState({ x: 42 });
    assert.equal(called, true);
  });
});

// ============================================================
// Middleware
// ============================================================

describe('middleware', () => {
  it('freeze middleware makes state immutable', () => {
    const useStore = createStore({
      state: { count: 0 },
      actions: { inc(s) { return { count: s.count + 1 }; } },
      middleware: [freezeMiddleware],
    });
    const store = useStore();
    store.dispatch('inc');
    assert.equal(store.getState().count, 1);
    assert.ok(Object.isFrozen(store.getState()), 'state should be frozen');
  });
});

// ============================================================
// combineStores
// ============================================================

describe('combineStores', () => {
  it('combines multiple stores', () => {
    const useAuth = createStore({
      state: { user: null },
      actions: { login(s, user) { return { user }; } },
    });
    const useCart = createStore({
      state: { items: [] },
      actions: { add(s, item) { return { items: [...s.items, item] }; } },
    });

    const combined = combineStores({ auth: useAuth, cart: useCart });

    combined.dispatch('auth', 'login', 'Alice');
    combined.dispatch('cart', 'add', 'Book');

    const state = combined.getState();
    assert.equal(state.auth.user, 'Alice');
    assert.deepEqual(state.cart.items, ['Book']);
  });

  it('combined subscribe fires on any sub-store change', () => {
    let calls = 0;
    const useA = createStore({
      state: { x: 0 },
      actions: { inc(s) { return { x: s.x + 1 }; } },
    });
    const useB = createStore({
      state: { y: 0 },
      actions: { inc(s) { return { y: s.y + 1 }; } },
    });

    const combined = combineStores({ a: useA, b: useB });
    combined.subscribe(() => calls++);

    combined.dispatch('a', 'inc');
    combined.dispatch('b', 'inc');
    assert.equal(calls, 2);
  });

  it('combined reset resets all stores', () => {
    const useA = createStore({
      state: { v: 0 },
      actions: { set(s, n) { return { v: n }; } },
    });
    const combined = combineStores({ a: useA });
    combined.dispatch('a', 'set', 99);
    combined.reset();
    assert.equal(combined.getState().a.v, 0);
  });

  it('throws on unknown namespace', () => {
    const combined = combineStores({});
    assert.throws(() => combined.dispatch('nope', 'x'), /Unknown store namespace/);
  });
});

// ============================================================
// Store name and destroy
// ============================================================

describe('store metadata', () => {
  it('has a name', () => {
    const useStore = createStore({ state: {}, name: 'my-store' });
    assert.equal(useStore().name, 'my-store');
  });

  it('destroy clears everything', () => {
    let calls = 0;
    const useStore = createStore({
      state: { x: 0 },
      actions: { inc(s) { return { x: s.x + 1 }; } },
    });
    const store = useStore();
    store.subscribe(() => calls++);
    store.destroy();
    store.dispatch('inc');
    assert.equal(calls, 0); // subscriber was cleared
  });
});

// ============================================================
// Security: deepClone safety
// ============================================================

describe('deepClone - security', () => {
  it('should handle circular references without stack overflow', () => {
    const useStore = createStore({
      state: { count: 0 },
      actions: {
        setCircular(state) {
          const obj = { a: 1 };
          obj.self = obj; // circular reference
          return { ...state, data: obj };
        },
      },
    });
    const store = useStore();
    // Should not throw stack overflow
    assert.doesNotThrow(() => store.dispatch('setCircular'));
  });

  it('should handle deeply nested objects without stack overflow', () => {
    // Build a 60-level deep object
    let deep = { value: 'leaf' };
    for (let i = 0; i < 60; i++) {
      deep = { child: deep };
    }
    const useStore = createStore({
      state: { data: null },
      actions: {
        setDeep(state, payload) { return { ...state, data: payload }; },
      },
    });
    const store = useStore();
    // Should not throw — beyond depth 50 it shallow-copies instead of overflowing
    assert.doesNotThrow(() => store.dispatch('setDeep', deep));
  });

  it('deepClone blocks prototype pollution via __proto__', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":"yes"},"safe":"value"}');
    const useStore = createStore({
      state: { data: null },
      actions: {
        setData(state, payload) { return { ...state, data: payload }; },
      },
    });
    const store = useStore();
    store.dispatch('setData', malicious);
    // After undo/redo, deepClone sanitizes the history snapshot
    store.undo();
    store.redo();
    const restored = store.getState().data;
    // __proto__ should NOT be copied as an own property to the deep-cloned object
    assert.strictEqual(restored.safe, 'value');
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(restored, '__proto__'), false,
      '__proto__ should not be copied as an own property in deepClone'
    );
    // Global Object prototype should not be polluted
    assert.strictEqual(({}).polluted, undefined, 'Object prototype should not be polluted');
  });
});
