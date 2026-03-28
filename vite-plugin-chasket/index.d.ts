/**
 * vite-plugin-chasket — Type definitions
 */

import type { Plugin } from 'vite';

export interface ChasketPluginOptions {
  /** Output target: 'js' or 'ts' */
  target?: 'js' | 'ts';
  /** Enable tree-shaking optimization */
  optimize?: boolean;
  /** Generate source maps (default: true) */
  sourceMap?: boolean;
}

/** Create a Vite plugin for Chasket components */
declare function chasketPlugin(options?: ChasketPluginOptions): Plugin;

export default chasketPlugin;
export { chasketPlugin };
