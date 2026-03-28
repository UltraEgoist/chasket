#!/usr/bin/env node
'use strict';

const { createServer } = require('../server');

const args = process.argv.slice(2);
const useStdio = args.includes('--stdio') || args.length === 0;

if (!useStdio) {
  process.stderr.write('Usage: chasket-lsp [--stdio]\n');
  process.exit(1);
}

const server = createServer(process.stdin, process.stdout);
server.start();
