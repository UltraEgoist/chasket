import { Readable } from 'stream';

/**
 * Render a Chasket component to an HTML string.
 */
export function renderToString(
  source: string,
  options?: {
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    hydrate?: boolean;
    includeStyle?: boolean;
    wrapInTag?: boolean;
  }
): string;

/**
 * Render a Chasket component as a Node.js Readable stream.
 * Streams HTML in chunks for improved TTFB.
 */
export function renderToStream(
  source: string,
  options?: {
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    hydrate?: boolean;
    includeStyle?: boolean;
    wrapInTag?: boolean;
    chunkSize?: number;
    highWaterMark?: number;
  }
): Readable;

/**
 * Render a complete HTML page.
 */
export function renderPage(options: {
  title?: string;
  body?: string;
  lang?: string;
  bundlePath?: string;
  head?: string;
  meta?: Record<string, string>;
}): string;

/**
 * Render a complete HTML page as a Readable stream.
 * Streams the page structure with early head flush.
 */
export function renderPageToStream(options: {
  title?: string;
  body?: string | Readable;
  lang?: string;
  bundlePath?: string;
  head?: string;
  meta?: Record<string, string>;
  highWaterMark?: number;
}): Readable;

/**
 * Parse a .csk source file into component data.
 */
export function parseComponent(source: string): {
  meta: { name?: string; shadow?: string };
  declarations: Record<string, { kind: string; init?: string; default?: string; expr?: string }>;
  template: unknown[];
  style: string;
};

/**
 * Get the client-side hydration runtime script.
 */
export function getHydrationRuntime(): string;

export function escapeHtml(val: unknown): string;
export function escapeAttr(val: unknown): string;
export function escapeUrl(val: unknown): string;

export default renderToString;
