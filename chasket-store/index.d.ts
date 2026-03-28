/**
 * @aspect/chasket-store — Type definitions
 */

export interface StoreDefinition<S extends object = Record<string, unknown>> {
  /** Initial state object */
  state: S;
  /** State mutation functions: (state, payload?) => newState */
  actions?: Record<string, (state: S, payload?: any) => S>;
  /** Computed derived values: (state) => value */
  getters?: Record<string, (state: S) => any>;
  /** Middleware functions */
  middleware?: MiddlewareFunction[];
  /** Store name (for devtools/persistence) */
  name?: string;
}

export interface StoreInstance<S extends object = Record<string, unknown>> {
  /** Get current state snapshot */
  getState(): S;
  /** Dispatch an action by name */
  dispatch(actionName: string, payload?: any): S;
  /** Get a computed/derived value */
  get(getterName: string): any;

  /** Subscribe to all state changes. Returns unsubscribe function. */
  subscribe(callback: (state: S) => void): () => void;
  /** Subscribe to a selected slice of state. Returns unsubscribe function. */
  select<T>(selector: (state: S) => T, callback: (value: T) => void): () => void;

  /** Batch multiple dispatches — subscribers only notified once at the end */
  batch(fn: () => void): void;

  /** Replace state entirely (for hydration, devtools) */
  setState(newState: S): void;
  /** Reset to initial state */
  reset(): void;

  /** Undo last action */
  undo(): boolean;
  /** Redo undone action */
  redo(): boolean;
  /** Whether undo is possible */
  readonly canUndo: boolean;
  /** Whether redo is possible */
  readonly canRedo: boolean;

  /** Store name */
  readonly name: string;
  /** Available action names */
  readonly actionNames: string[];
  /** Available getter names */
  readonly getterNames: string[];

  /** Destroy the store and clean up */
  destroy(): void;
}

export interface UseStoreHook<S extends object = Record<string, unknown>> {
  (): StoreInstance<S>;
  store: StoreInstance<S>;
  readonly state: S;
  getState(): S;
  dispatch(actionName: string, payload?: any): S;
  get(getterName: string): any;
  subscribe(callback: (state: S) => void): () => void;
  select<T>(selector: (state: S) => T, callback: (value: T) => void): () => void;
  batch(fn: () => void): void;
  setState(newState: S): void;
  reset(): void;
  undo(): boolean;
  redo(): boolean;
  destroy(): void;
}

export interface MiddlewareContext<S = any> {
  state: S;
  actionName: string;
  payload: any;
  dispatch: (state: S) => S;
  storeName: string;
}

export type MiddlewareFunction = (context: MiddlewareContext) => any;

export interface CombinedStore {
  /** Get combined state from all stores */
  getState(): Record<string, any>;
  /** Dispatch to a specific store by namespace */
  dispatch(namespace: string, actionName: string, payload?: any): any;
  /** Get a getter from a specific store */
  get(namespace: string, getterName: string): any;
  /** Subscribe to any store change */
  subscribe(callback: (combinedState: Record<string, any>) => void): () => void;
  /** Reset all stores */
  reset(): void;
  /** Destroy all stores */
  destroy(): void;
}

export interface PersistOptions {
  serialize?: (state: any) => string;
  deserialize?: (raw: string) => any;
}

/** Create a reactive global store */
export function createStore<S extends object = Record<string, unknown>>(
  definition: StoreDefinition<S>
): UseStoreHook<S>;

/** Combine multiple stores into a unified namespace */
export function combineStores(
  stores: Record<string, UseStoreHook>
): CombinedStore;

/** Logger middleware — logs dispatched actions and state changes */
export const loggerMiddleware: MiddlewareFunction;

/** Persistence middleware — saves state to localStorage */
export function persistMiddleware(key: string, options?: PersistOptions): MiddlewareFunction;

/** Load persisted state from localStorage */
export function loadPersistedState<S = any>(key: string, fallback: S): S;

/** Freeze middleware — deep-freezes state after each action */
export const freezeMiddleware: MiddlewareFunction;

export default createStore;
