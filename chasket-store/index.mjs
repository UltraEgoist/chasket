/**
 * @chasket/chasket-store — ESM entry
 * Reactive global state management for Chasket applications.
 * @module @chasket/chasket-store
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = require('./index.js');

export const createStore = store.createStore;
export const combineStores = store.combineStores;
export const loggerMiddleware = store.loggerMiddleware;
export const persistMiddleware = store.persistMiddleware;
export const loadPersistedState = store.loadPersistedState;
export const freezeMiddleware = store.freezeMiddleware;

export default createStore;
