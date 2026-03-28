/**
 * Chasket Language Server Protocol implementation
 * @module @aspect/chasket-lsp
 */

import { Readable, Writable } from 'stream';

export interface LspServer {
  start(): void;
  transport: LspTransport;
  service: ChasketLanguageService;
}

export interface LspTransport {
  onRequest(method: string, handler: (params: any) => any): void;
  onNotification(method: string, handler: (params: any) => void): void;
  sendNotification(method: string, params: any): void;
  sendRequest(method: string, params: any): Promise<any>;
  start(): void;
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  range: Range;
  severity: number;
  code?: string;
  source: string;
  message: string;
}

export interface Hover {
  contents: { kind: string; value: string };
}

export interface Location {
  uri: string;
  range: Range;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
}

export interface DocumentSymbol {
  name: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  detail?: string;
}

export interface FoldingRange {
  startLine: number;
  endLine: number;
  kind: string;
}

export interface WorkspaceEdit {
  changes: Record<string, Array<{ range: Range; newText: string }>>;
}

export interface SignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters: any[];
  }>;
  activeSignature: number;
  activeParameter: number;
}

export declare class ChasketLanguageService {
  setCompilerPath(path: string): void;
  openDocument(uri: string, text: string, version: number): void;
  updateDocument(uri: string, text: string, version: number): void;
  closeDocument(uri: string): void;
  getDiagnostics(uri: string): Diagnostic[];
  getHover(uri: string, position: Position): Hover | null;
  getCompletion(uri: string, position: Position): CompletionItem[];
  getDefinition(uri: string, position: Position): Location | null;
  getDocumentSymbols(uri: string): DocumentSymbol[];
  getReferences(uri: string, position: Position): Location[];
  getRenameEdits(uri: string, position: Position, newName: string): WorkspaceEdit | null;
  getFoldingRanges(uri: string): FoldingRange[];
  getSignatureHelp(uri: string, position: Position): SignatureHelp | null;
  formatDocument(uri: string): Array<{ range: Range; newText: string }>;
}

export declare function createServer(input: Readable, output: Writable): LspServer;
