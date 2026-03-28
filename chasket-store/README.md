# @aspect/chasket-store

Reactive state management for Chasket applications. Flux-based architecture with typed actions, selectors, middleware, and time-travel debugging.

Zero dependencies.

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
  },
});

const counter = useCounter();
counter.dispatch('increment');
console.log(counter.getState().count); // 1
console.log(counter.get('doubled'));   // 2
```

## API

### createStore(definition)

Returns a hook function that provides access to the store instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `state` | `object` | (required) | Initial state |
| `actions` | `Record<string, Function>` | `{}` | State mutation functions |
| `getters` | `Record<string, Function>` | `{}` | Derived value selectors |
| `middleware` | `Function[]` | `[]` | Middleware pipeline |
| `name` | `string` | `'chasket-store'` | Store name for debugging |

### Store instance

| Method | Description |
|--------|-------------|
| `dispatch(action, payload?)` | Dispatch an action |
| `getState()` | Get current state snapshot |
| `get(getter)` | Compute a getter value |
| `subscribe(listener)` | Subscribe to state changes |
| `use(middleware)` | Add middleware at runtime |

### Middleware

```javascript
const logger = (store) => (next) => (action, payload) => {
  console.log('dispatching', action);
  const result = next(action, payload);
  console.log('next state', store.getState());
  return result;
};
```

## Part of the Chasket ecosystem

This package is part of [Chasket](https://www.npmjs.com/package/@aspect/chasket), a template-first Web Component compiler.

## License

[MIT](../LICENSE)
