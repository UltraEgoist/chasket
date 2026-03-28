/**
 * @chasket/chasket-router — Type definitions
 */

export interface RouteConfig {
  /** Route path pattern (e.g., '/users/:id', '/files/*') */
  path: string;
  /** Custom element tag name to render */
  component: string;
  /** Arbitrary metadata attached to the route */
  meta?: Record<string, unknown>;
  /** Nested child routes */
  children?: RouteConfig[];
}

export interface RouteState {
  /** Current pathname */
  path: string;
  /** Dynamic route parameters */
  params: Record<string, string>;
  /** Parsed query string parameters */
  query: Record<string, string>;
  /** Route metadata */
  meta: Record<string, unknown>;
  /** Matched component tag name, or null */
  component: string | null;
  /** URL hash fragment */
  hash: string;
  /** Whether a route was matched */
  matched: boolean;
}

export interface RouterOptions {
  /** Array of route definitions */
  routes?: RouteConfig[];
  /** Routing mode: 'history' (pushState) or 'hash' */
  mode?: 'history' | 'hash';
  /** Base path prefix */
  base?: string;
}

export type NavigationGuard = (
  to: RouteState,
  from: RouteState
) => boolean | string | void | Promise<boolean | string | void>;

export type AfterHook = (
  to: RouteState,
  from: RouteState
) => void | Promise<void>;

export type RouteChangeCallback = (
  current: RouteState,
  previous: RouteState
) => void;

export interface RouterInstance {
  /** Current route state (reactive read) */
  readonly current: RouteState;
  /** All configured routes */
  readonly routes: Array<{ path: string; component: string; meta?: Record<string, unknown> }>;

  /** Navigate to a new path, adding a history entry */
  push(to: string): Promise<boolean>;
  /** Replace current path without adding a history entry */
  replace(to: string): Promise<boolean>;
  /** Go back in browser history */
  back(): void;
  /** Go forward in browser history */
  forward(): void;
  /** Navigate by history offset */
  go(delta: number): void;

  /** Register a before-navigation guard. Returns unsubscribe function. */
  beforeEach(guard: NavigationGuard): () => void;
  /** Register an after-navigation hook. Returns unsubscribe function. */
  afterEach(hook: AfterHook): () => void;
  /** Subscribe to route changes. Returns unsubscribe function. */
  subscribe(callback: RouteChangeCallback): () => void;

  /** Resolve a path to its route without navigating */
  resolve(path: string): RouteState;
  /** Initialize the router (call once at app startup) */
  start(): Promise<boolean>;
  /** Clean up event listeners */
  destroy(): void;
}

export interface CompiledPattern {
  regex: RegExp;
  paramNames: string[];
  isWildcard: boolean;
}

export interface MatchResult {
  matched: boolean;
  params: Record<string, string>;
}

/** Create a new Chasket Router instance */
export function createRouter(options?: RouterOptions): RouterInstance;

/** Parse a route pattern into a regex and param name list */
export function compilePattern(pattern: string): CompiledPattern;

/** Match a pathname against a compiled route */
export function matchRoute(pathname: string, compiled: CompiledPattern): MatchResult;

/** Parse query string into an object */
export function parseQuery(search: string): Record<string, string>;

/** Register all router custom elements (<chasket-router>, <chasket-route>, <chasket-link>) */
export function registerRouterElements(): void;

/** <chasket-router> custom element class */
export class ChasketRouter extends HTMLElement {
  router: RouterInstance;
}

/** <chasket-route> custom element class */
export class ChasketRoute extends HTMLElement {}

/** <chasket-link> custom element class */
export class ChasketLink extends HTMLElement {}

export default createRouter;
