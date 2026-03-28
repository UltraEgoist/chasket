/**
 * vite-plugin-chasket
 *
 * Vite plugin for compiling .csk files to Web Components.
 *
 * Usage:
 *   // vite.config.js
 *   import chasket from 'vite-plugin-chasket'
 *   export default {
 *     plugins: [chasket()]
 *   }
 *
 * Options:
 *   - target: 'js' | 'ts' (default: 'js')
 *   - optimize: boolean (default: false) — enable tree-shaking
 *   - sourceMap: boolean (default: true)
 *
 * @module vite-plugin-chasket
 */

const path = require('path');

/**
 * Create a Vite plugin for Chasket components.
 *
 * @param {Object} [options] - Plugin options
 * @param {string} [options.target='js'] - Output target ('js' or 'ts')
 * @param {boolean} [options.optimize=false] - Enable tree-shaking optimization
 * @param {boolean} [options.sourceMap=true] - Generate source maps
 * @returns {import('vite').Plugin} Vite plugin
 */
function chasketPlugin(options = {}) {
  const target = options.target || 'js';
  const optimize = options.optimize || false;
  const enableSourceMap = options.sourceMap !== false;

  // Lazy-load compiler to avoid startup cost
  let compile = null;

  function getCompiler() {
    if (!compile) {
      try {
        // Try to load from @chasket/chasket package
        compile = require('@chasket/chasket').compile;
      } catch {
        try {
          // Try relative path (monorepo development)
          compile = require('../chasket-cli/lib/compiler').compile;
        } catch {
          throw new Error(
            'vite-plugin-chasket: Could not find Chasket compiler.\n' +
            'Install @chasket/chasket as a devDependency:\n' +
            '  npm install -D @chasket/chasket'
          );
        }
      }
    }
    return compile;
  }

  return {
    name: 'vite-plugin-chasket',

    // Transform .csk files
    transform(code, id) {
      if (!id.endsWith('.csk')) return null;

      const compiler = getCompiler();
      const fileName = path.basename(id);

      const result = compiler(code, fileName, { target, optimize });

      if (!result.success) {
        // Format diagnostics as error message
        const errors = result.diagnostics
          .filter(d => d.level === 'error')
          .map(d => `[${d.code}] ${d.message}`)
          .join('\n');

        this.error(`Chasket compilation failed for ${fileName}:\n${errors}`);
        return null;
      }

      // Collect warnings
      for (const d of result.diagnostics) {
        if (d.level === 'warning') {
          this.warn(`[${d.code}] ${d.message}`);
        }
      }

      // Strip the IIFE wrapper for ES module compatibility
      // The output is: import ...\n\n(() => { ... })();
      // We need to keep imports at top-level and unwrap the IIFE
      let output = result.output;

      // Remove sourceMappingURL comment (we provide our own via Vite)
      output = output.replace(/\n\/\/# sourceMappingURL=.*$/, '');

      // Generate source map if enabled
      let map = null;
      if (enableSourceMap && result.sourceMap) {
        map = {
          ...result.sourceMap,
          file: fileName.replace('.csk', '.js'),
          sources: [id],
        };
      }

      return {
        code: output,
        map,
      };
    },

    // Handle HMR for .csk files
    handleHotUpdate({ file, server, modules }) {
      if (!file.endsWith('.csk')) return;

      const affected = modules.filter(m =>
        m.file && m.file.endsWith('.csk')
      );

      if (affected.length > 0) {
        server.ws.send({
          type: 'full-reload',
          path: '*',
        });
        return [];
      }
    },

    // Resolve .csk imports
    resolveId(source, importer) {
      // Handle bare .csk imports
      if (source.endsWith('.csk') && importer) {
        const resolved = path.resolve(path.dirname(importer), source);
        return resolved;
      }
      return null;
    },
  };
}

module.exports = chasketPlugin;
module.exports.default = chasketPlugin;
