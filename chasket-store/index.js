/**
 * @aspect/chasket-store — Reactive global state management for Chasket applications
 *
 * Provides a lightweight, reactive store that integrates with Chasket's
 * `consume` / `provide` pattern and Web Component lifecycle.
 *
 * Features:
 * - createStore: Define typed global state with actions and getters
 * - Reactive subscriptions with fine-grained selectors
 * - Middleware system (logging, persistence, devtools)
 * - Computed derived state
 * - Action batching for performance
 * - Time-travel debugging (undo/redo)
 * - Integrates with Chasket's provide/consume for component binding
 *
 * Usage:
 *   const useCounter = createStore({
 *     state: { count: 0 },
 *     actions: {
 *       increment(state) { return { ...state, count: state.count + 1 }; },
 *       add(state, amount) { return { ...state, count: state.count + amount }; },
 *     },
 *     getters: {
 *       doubled(state) { return state.count * 2; },
 *     }
 *   });
 *
 *   // In any component:
 *   const counter = useCounter();
 *   counter.subscribe(state => console.log(state.count));
 *   counter.dispatch('increment');
 *
 * @module @aspect/chasket-store
 */

'use strict';

// ============================================================
// Core Store Factory
// ============================================================

/**
 * Create a reactive global store.
 *
 * @param {Object} definition
 * @param {Object} definition.state - Initial state object
 * @param {Object<string, Function>} [definition.actions] - State mutation functions
 * @param {Object<string, Function>} [definition.getters] - Computed derived values
 * @param {Array<Function>} [definition.middleware] - Middleware functions
 * @param {string} [definition.name] - Store name (for devtools/persistence)
 * @returns {Function} Hook-like function that returns the store instance
 */
function createStore(definition) {
  const {
    state: initialState,
    actions = {},
    getters = {},
    middleware = [],
    name = 'chasket-store',
  } = definition;

  // ── State ──
  let currentState = deepClone(initialState);
  const subscribers = new Set();
  const selectorSubscribers = new Map(); // selector-fn → Set<{ selector, callback, lastValue }>
  let batchDepth = 0;
  let batchPending = false;

  // ── History (time-travel) ──
  const history = [deepClone(initialState)];
  let historyIndex = 0;
  const MAX_HISTORY = 100;

  // ── Middleware chain ──
  function applyMiddleware(actionName, payload, next) {
    let idx = 0;
    function dispatch(state) {
      if (idx < middleware.length) {
        const mw = middleware[idx++];
        return mw({ state, actionName, payload, dispatch, storeName: name });
      }
      return next(state);
    }
    return dispatch(currentState);
  }

  // ── Notification ──
  function notify() {
    if (batchDepth > 0) {
      batchPending = true;
      return;
    }

    const state = currentState;

    // Full subscribers
    for (const fn of subscribers) {
      try { fn(state); } catch (e) { console.error(`[${name}] subscriber error:`, e); }
    }

    // Selector subscribers — only fire if selected value changed
    for (const [, subs] of selectorSubscribers) {
      for (const entry of subs) {
        try {
          const newVal = entry.selector(state);
          if (!shallowEqual(newVal, entry.lastValue)) {
            entry.lastValue = newVal;
            entry.callback(newVal);
          }
        } catch (e) {
          console.error(`[${name}] selector subscriber error:`, e);
        }
      }
    }
  }

  // ── Public API ──
  const store = {
    /** Get current state (readonly snapshot) */
    getState() {
      return currentState;
    },

    /** Dispatch an action by name */
    dispatch(actionName, payload) {
      if (!actions[actionName]) {
        throw new Error(`[${name}] Unknown action: "${actionName}"`);
      }

      const actionFn = actions[actionName];

      const newState = applyMiddleware(actionName, payload, (state) => {
        return actionFn(state, payload);
      });

      if (newState !== undefined && newState !== currentState) {
        // セキュリティ: deepClone で prototype pollution ベクターを除去
        // frozen なオブジェクトは変更不可のため安全にスキップ
        currentState = Object.isFrozen(newState) ? newState : deepClone(newState);

        // Record history
        if (historyIndex < history.length - 1) {
          history.splice(historyIndex + 1);
        }
        history.push(deepClone(currentState));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;

        notify();
      }

      return currentState;
    },

    /** Get a computed/derived value */
    get(getterName) {
      if (!getters[getterName]) {
        throw new Error(`[${name}] Unknown getter: "${getterName}"`);
      }
      return getters[getterName](currentState);
    },

    /** Subscribe to all state changes */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    /**
     * Subscribe to a selected slice of state.
     * Only fires when the selected value changes (shallow comparison).
     *
     * @param {Function} selector - e.g. state => state.user.name
     * @param {Function} callback - Called with the new selected value
     * @returns {Function} Unsubscribe function
     */
    select(selector, callback) {
      const entry = {
        selector,
        callback,
        lastValue: selector(currentState),
      };

      const key = selector.toString();
      if (!selectorSubscribers.has(key)) {
        selectorSubscribers.set(key, new Set());
      }
      selectorSubscribers.get(key).add(entry);

      return () => {
        const set = selectorSubscribers.get(key);
        if (set) {
          set.delete(entry);
          if (set.size === 0) selectorSubscribers.delete(key);
        }
      };
    },

    /**
     * Batch multiple dispatches — subscribers only notified once at the end.
     * @param {Function} fn - Function that calls dispatch multiple times
     */
    batch(fn) {
      batchDepth++;
      try {
        fn();
      } finally {
        batchDepth--;
        if (batchDepth === 0 && batchPending) {
          batchPending = false;
          notify();
        }
      }
    },

    /** Replace state entirely (for hydration, devtools, etc.) */
    setState(newState) {
      currentState = deepClone(newState);
      history.push(deepClone(currentState));
      if (history.length > MAX_HISTORY) history.shift();
      historyIndex = history.length - 1;
      notify();
    },

    /** Reset to initial state */
    reset() {
      currentState = deepClone(initialState);
      history.length = 0;
      history.push(deepClone(currentState));
      historyIndex = 0;
      notify();
    },

    /** Undo last action */
    undo() {
      if (historyIndex > 0) {
        historyIndex--;
        currentState = deepClone(history[historyIndex]);
        notify();
        return true;
      }
      return false;
    },

    /** Redo undone action */
    redo() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        currentState = deepClone(history[historyIndex]);
        notify();
        return true;
      }
      return false;
    },

    /** Check if undo is possible */
    get canUndo() { return historyIndex > 0; },

    /** Check if redo is possible */
    get canRedo() { return historyIndex < history.length - 1; },

    /** Store name */
    get name() { return name; },

    /** Get all available action names */
    get actionNames() { return Object.keys(actions); },

    /** Get all available getter names */
    get getterNames() { return Object.keys(getters); },

    /** Destroy the store and clean up */
    destroy() {
      subscribers.clear();
      selectorSubscribers.clear();
      history.length = 0;
    },
  };

  // ── Return as a hook-style function ──
  // Calling useStore() returns the same singleton instance
  function useStore() {
    return store;
  }
  useStore.store = store;

  // Expose store methods directly on the hook for convenience
  Object.keys(store).forEach(key => {
    if (typeof store[key] === 'function') {
      useStore[key] = store[key].bind(store);
    }
  });
  Object.defineProperty(useStore, 'state', { get: () => store.getState() });

  return useStore;
}

// ============================================================
// Built-in Middleware
// ============================================================

/**
 * Logger middleware — logs dispatched actions and state changes.
 */
function loggerMiddleware({ state, actionName, payload, dispatch, storeName }) {
  const prevState = state;
  const result = dispatch(state);
  if (typeof console !== 'undefined' && console.groupCollapsed) {
    console.groupCollapsed(`[${storeName}] ${actionName}`);
    console.log('prev:', prevState);
    console.log('payload:', payload);
    console.log('next:', result);
    console.groupEnd();
  }
  return result;
}

/**
 * Persistence middleware — saves state to localStorage on each action.
 *
 * @param {string} key - localStorage key
 * @param {Object} [options]
 * @param {Function} [options.serialize=JSON.stringify]
 * @param {Function} [options.deserialize=JSON.parse]
 * @returns {Function} Middleware function
 */
function persistMiddleware(key, options = {}) {
  const serialize = options.serialize || JSON.stringify;
  const deserialize = options.deserialize || JSON.parse;

  return ({ state, actionName, payload, dispatch, storeName }) => {
    const result = dispatch(state);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, serialize(result));
      }
    } catch (e) {
      console.warn(`[${storeName}] persist error:`, e);
    }
    return result;
  };
}

/**
 * Load persisted state from localStorage.
 * Use this to hydrate initial state.
 *
 * @param {string} key - localStorage key
 * @param {Object} fallback - Default state if nothing persisted
 * @returns {Object} The loaded or fallback state
 */
function loadPersistedState(key, fallback) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[chasket-store] loadPersistedState error:', e);
  }
  return fallback;
}

/**
 * Freeze middleware — deep-freezes state after each action (development only).
 */
function freezeMiddleware({ state, dispatch }) {
  const result = dispatch(state);
  return deepFreeze(result);
}

// ============================================================
// combineStores — merge multiple stores into a single interface
// ============================================================

/**
 * Combine multiple stores into a unified namespace.
 *
 * @param {Object<string, Function>} stores - Map of namespace → useStore hook
 * @returns {Object} Combined store API
 */
function combineStores(stores) {
  return {
    getState() {
      const combined = {};
      for (const [ns, useStore] of Object.entries(stores)) {
        combined[ns] = useStore.store.getState();
      }
      return combined;
    },

    dispatch(namespace, actionName, payload) {
      if (!stores[namespace]) throw new Error(`Unknown store namespace: "${namespace}"`);
      return stores[namespace].store.dispatch(actionName, payload);
    },

    subscribe(fn) {
      const unsubs = Object.values(stores).map(useStore =>
        useStore.store.subscribe(() => fn(this.getState()))
      );
      return () => unsubs.forEach(u => u());
    },

    get(namespace, getterName) {
      if (!stores[namespace]) throw new Error(`Unknown store namespace: "${namespace}"`);
      return stores[namespace].store.get(getterName);
    },

    reset() {
      for (const useStore of Object.values(stores)) {
        useStore.store.reset();
      }
    },

    destroy() {
      for (const useStore of Object.values(stores)) {
        useStore.store.destroy();
      }
    },
  };
}

// ============================================================
// Utilities
// ============================================================

function deepClone(obj, depth = 0, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return obj;
  // セキュリティ: 深度制限でスタックオーバーフローを防止
  if (depth > 50) {
    console.warn('[chasket-store] deepClone: maximum depth exceeded, returning shallow copy');
    // セキュリティ: Object.create(null) で __proto__ 汚染を防止
    if (Array.isArray(obj)) return [...obj];
    const safe = Object.create(null);
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      safe[key] = obj[key];
    }
    return Object.assign(Object.create(Object.getPrototypeOf(obj)), safe);
  }
  // セキュリティ: 循環参照を検出して無限再帰を防止
  if (seen.has(obj)) {
    console.warn('[chasket-store] deepClone: circular reference detected, returning null');
    return null;
  }
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map(item => deepClone(item, depth + 1, seen));
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
  const result = {};
  // セキュリティ: getOwnPropertyNames で prototype pollution を防止
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    result[key] = deepClone(obj[key], depth + 1, seen);
  }
  return result;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Object.isFrozen(obj[key])) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// ============================================================
// Exports
// ============================================================

module.exports = createStore;
module.exports.default = createStore;
module.exports.createStore = createStore;
module.exports.combineStores = combineStores;
module.exports.loggerMiddleware = loggerMiddleware;
module.exports.persistMiddleware = persistMiddleware;
module.exports.loadPersistedState = loadPersistedState;
module.exports.freezeMiddleware = freezeMiddleware;
