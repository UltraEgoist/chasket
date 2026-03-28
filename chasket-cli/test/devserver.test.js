/**
 * @fileoverview Dev server integration tests
 *
 * Tests the dev server's HTTP serving, security headers, path traversal
 * protection, WebSocket handshake, and HMR injection behaviour by
 * spawning the server as a child process and making real HTTP requests.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Find an available port
function findPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Simple HTTP GET helper
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

// Wait until server is listening
function waitForServer(port, maxWait = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > maxWait) {
        return reject(new Error('Server did not start in time'));
      }
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', () => setTimeout(tryConnect, 100));
    }
    tryConnect();
  });
}

describe('dev server', () => {
  let port;
  let proc;
  const tmpDir = path.join(__dirname, '__devserver_test_tmp__');
  const srcDir = path.join(tmpDir, 'src', 'components');
  const htmlDir = path.join(tmpDir, 'src');

  before(async () => {
    // Create temp project structure
    fs.mkdirSync(srcDir, { recursive: true });

    // Create a minimal .csk component
    fs.writeFileSync(path.join(srcDir, 'x-test.csk'), `<meta>
  name: "x-test"
</meta>
<script>
  state count: number = 0
</script>
<template>
  <div>{{ count }}</div>
</template>
<style>
  div { color: blue; }
</style>`);

    // Create index.html
    fs.writeFileSync(path.join(htmlDir, 'index.html'),
      '<!DOCTYPE html><html><head></head><body><x-test></x-test></body></html>');

    port = await findPort();

    // Start dev server
    proc = spawn(process.execPath, [
      path.resolve(__dirname, '..', 'bin', 'chasket.js'),
      'dev',
      '--port', String(port),
    ], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    // Wait for server to be ready
    await waitForServer(port);
  });

  after(() => {
    if (proc) {
      proc.kill('SIGTERM');
    }
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── HTTP serving ───

  it('serves index.html on root path', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<!DOCTYPE html>'));
    assert.ok(res.body.includes('<x-test>'));
  });

  it('injects HMR runtime into HTML', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('__chasketClasses'), 'Should inject HMR runtime');
    assert.ok(res.body.includes('nonce='), 'Should include CSP nonce');
  });

  it('returns 404 for non-existent files', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/nonexistent.js`);
    assert.strictEqual(res.status, 404);
  });

  // ─── Security headers ───

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });

  it('sets Content-Security-Policy header', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'Should have CSP header');
    assert.ok(csp.includes("default-src 'self'"), 'CSP should restrict default-src');
  });

  it('sets Cache-Control: no-cache', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.headers['cache-control'], 'no-cache');
  });

  it('restricts CORS to localhost', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    const cors = res.headers['access-control-allow-origin'];
    assert.ok(cors.includes('localhost'), 'CORS should be restricted to localhost');
  });

  // ─── Path traversal protection ───

  it('blocks path traversal with .. (server returns 403 or client resolves to 404)', async () => {
    // HTTP clients normalize ".." before sending, so the server may never see it.
    // The server's path traversal protection is a defense-in-depth measure.
    const res = await httpGet(`http://127.0.0.1:${port}/../../../etc/passwd`);
    assert.ok([403, 404].includes(res.status), `Expected 403 or 404, got ${res.status}`);
  });

  it('blocks encoded path traversal', async () => {
    // %2e%2e may be decoded by the client before sending
    const res = await httpGet(`http://127.0.0.1:${port}/%2e%2e/%2e%2e/etc/passwd`);
    assert.ok([403, 404].includes(res.status), `Expected 403 or 404, got ${res.status}`);
  });

  it('blocks double-encoded path traversal', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/%252e%252e/%252e%252e/etc/passwd`);
    assert.strictEqual(res.status, 403);
  });

  it('blocks null byte injection', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/index.html%00.js`);
    assert.strictEqual(res.status, 403);
  });

  // ─── WebSocket handshake ───

  it('accepts valid WebSocket upgrade', async () => {
    const key = crypto.randomBytes(16).toString('base64');
    const expectedAccept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const result = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
          'Origin': `http://localhost:${port}`,
        },
      });

      req.on('upgrade', (res, socket) => {
        const accept = res.headers['sec-websocket-accept'];
        socket.destroy();
        resolve({ status: res.statusCode, accept });
      });

      req.on('error', reject);
      req.end();

      // Timeout
      setTimeout(() => reject(new Error('WebSocket upgrade timed out')), 3000);
    });

    assert.strictEqual(result.status, 101);
    assert.strictEqual(result.accept, expectedAccept);
  });

  it('rejects WebSocket from unauthorized origin', async () => {
    const key = crypto.randomBytes(16).toString('base64');

    const result = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
          'Origin': 'http://evil.example.com',
        },
      });

      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve({ upgraded: true });
      });

      // Connection should be destroyed, resulting in socket close/error
      req.on('error', () => resolve({ upgraded: false }));

      // Also handle socket close without upgrade
      req.on('close', () => {
        // If no upgrade happened, this is expected
      });

      req.end();

      // Timeout means no upgrade = success
      setTimeout(() => resolve({ upgraded: false }), 1500);
    });

    assert.strictEqual(result.upgraded, false, 'Should reject unauthorized origin');
  });

  it('rejects WebSocket with invalid key', async () => {
    const result = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'not-valid-base64!!!',
          'Sec-WebSocket-Version': '13',
          'Origin': `http://localhost:${port}`,
        },
      });

      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve({ upgraded: true });
      });

      req.on('error', () => resolve({ upgraded: false }));
      req.end();

      setTimeout(() => resolve({ upgraded: false }), 1500);
    });

    assert.strictEqual(result.upgraded, false, 'Should reject invalid WebSocket key');
  });
});
