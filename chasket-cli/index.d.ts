/**
 * @aspect/chasket — Compiler Type definitions
 */

export interface CompileOptions {
  /** Output target */
  target?: 'js' | 'ts';
  /** Enable tree-shaking optimization */
  optimize?: boolean;
  /** Component registry for auto-import resolution */
  componentRegistry?: Map<string, { tag: string; path: string }>;
}

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  hint?: string;
  line?: number;
}

export interface CompileResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Generated JavaScript code */
  output?: string;
  /** Generated TypeScript declaration (.d.ts) */
  dtsOutput?: string;
  /** Errors and warnings */
  diagnostics: Diagnostic[];
  /** Source map */
  sourceMap?: {
    version: number;
    sources: string[];
    names: string[];
    mappings: string;
    file?: string;
  };
  /** Component metadata */
  meta?: {
    name: string;
    shadow: string;
    form: boolean;
    generics?: Array<{
      name: string;
      constraint: TypeNode | null;
      default: TypeNode | null;
    }>;
  };
}

export interface TypeNode {
  kind: 'primitive' | 'array' | 'union' | 'literal' | 'object' | 'generic';
  name?: string;
  element?: TypeNode;
  types?: TypeNode[];
  value?: string;
  fields?: Array<{ name: string; type: TypeNode; optional: boolean }>;
  typeArgs?: TypeNode[];
}

/** Compile a .csk source file to a Web Component */
export function compile(
  source: string,
  fileName: string,
  options?: CompileOptions
): CompileResult;
