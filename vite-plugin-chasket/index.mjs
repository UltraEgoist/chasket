/**
 * vite-plugin-chasket (ESM entry)
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
 * @module vite-plugin-chasket
 */

import { createRequire } from 'module';
import { basename, resolve, dirname } from 'path';

const require = createRequire(import.meta.url);

/**
 * Create a Vite plugin for Chasket components.
 *
 * @param {Object} [options] - Plugin options
 * @param {string} [options.target='js'] - Output target ('js' or 'ts')
 * @param {boolean} [options.optimize=false] - Enable tree-shaking optimization
 * @param {boolean} [options.sourceMap=true] - Generate source maps
 * @returns {import('vite').Plugin} Vite plugin
 */
export default function chasketPlugin(options = {}) {
  const target = options.target || 'js';
  const optimize = options.optimize || false;
  const enableSourceMap = options.sourceMap !== false;

  // Lazy-load compiler to avoid startup cost
  let compile = null;

  function getCompiler() {
    if (!compile) {
      try {
        compile = require('@chasket/chasket').compile;
      } catch {
        try {
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

    transform(code, id) {
      if (!id.endsWith('.csk')) return null;

      const compiler = getCompiler();
      const fileName = basename(id);
      const result = compiler(code, fileName, { target, optimize });

      if (!result.success) {
        const errors = result.diagnostics
          .filter(d => d.level === 'error')
          .map(d => `[${d.code}] ${d.message}`)
          .join('\n');
        this.error(`Chasket compilation failed for ${fileName}:\n${errors}`);
        return null;
      }

      for (const d of result.diagnostics) {
        if (d.level === 'warning') {
          this.warn(`[${d.code}] ${d.message}`);
        }
      }

      let output = result.output;
      output = output.replace(/\n\/\/# sourceMappingURL=.*$/, '');

      let map = null;
      if (enableSourceMap && result.sourceMap) {
        map = {
          ...result.sourceMap,
          file: fileName.replace('.csk', '.js'),
          sources: [id],
        };
      }

      return { code: output, map };
    },

    handleHotUpdate({ file, server, modules }) {
      if (!file.endsWith('.csk')) return;

      const affected = modules.filter(m =>
        m.file && m.file.endsWith('.csk')
      );

      if (affected.length > 0) {
        server.ws.send({ type: 'full-reload', path: '*' });
        return [];
      }
    },

    resolveId(source, importer) {
      if (source.endsWith('.csk') && importer) {
        return resolve(dirname(importer), source);
      }
      return null;
    },
  };
}
