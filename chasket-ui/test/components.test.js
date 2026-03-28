/**
 * @aspect/chasket-ui component compilation tests
 *
 * Verifies all UI components compile successfully and produce
 * correct Web Component output with expected features.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { compile } = require('../../chasket-cli/lib/compiler');

const COMPONENTS_DIR = path.join(__dirname, '..', 'components');

function readComponent(name) {
  return fs.readFileSync(path.join(COMPONENTS_DIR, `${name}.csk`), 'utf-8');
}

function compileComponent(name, options = {}) {
  const src = readComponent(name);
  const r = compile(src, `${name}.csk`, options);
  return r;
}

function assertCompiles(name) {
  const r = compileComponent(name);
  assert.equal(r.success, true, `${name} should compile successfully. Errors: ${JSON.stringify(r.diagnostics.filter(d => d.level === 'error'))}`);
  return r;
}

// ============================================================
// Compilation Tests — All components compile
// ============================================================

describe('chasket-ui: compilation', () => {
  const components = fs.readdirSync(COMPONENTS_DIR)
    .filter(f => f.endsWith('.csk'))
    .map(f => f.replace('.csk', ''));

  for (const name of components) {
    it(`${name} compiles without errors`, () => {
      assertCompiles(name);
    });
  }
});

// ============================================================
// fl-button
// ============================================================

describe('fl-button', () => {
  it('defines custom element "fl-button"', () => {
    const r = assertCompiles('fl-button');
    assert.ok(r.output.includes("'fl-button'"), 'should register fl-button');
  });

  it('has variant/size/disabled/loading props', () => {
    const r = assertCompiles('fl-button');
    assert.ok(r.output.includes('variant'), 'should have variant prop');
    assert.ok(r.output.includes('size'), 'should have size prop');
    assert.ok(r.output.includes('disabled'), 'should have disabled prop');
    assert.ok(r.output.includes('loading'), 'should have loading prop');
  });

  it('emits press event', () => {
    const r = assertCompiles('fl-button');
    assert.ok(r.output.includes("'press'"), 'should emit press');
  });

  it('includes spinner CSS animation', () => {
    const r = assertCompiles('fl-button');
    assert.ok(r.output.includes('fl-spin'), 'should have spinner keyframes');
  });
});

// ============================================================
// fl-input
// ============================================================

describe('fl-input', () => {
  it('is form-associated', () => {
    const r = assertCompiles('fl-input');
    assert.ok(r.output.includes('formAssociated'), 'should be form-associated');
    assert.ok(r.output.includes('attachInternals'), 'should attach internals');
  });

  it('emits input and change events', () => {
    const r = assertCompiles('fl-input');
    assert.ok(r.output.includes("'input'"), 'should emit input');
    assert.ok(r.output.includes("'change'"), 'should emit change');
  });

  it('uses setFormValue and setValidity', () => {
    const r = assertCompiles('fl-input');
    assert.ok(r.output.includes('setFormValue'), 'should use setFormValue');
    assert.ok(r.output.includes('setValidity'), 'should use setValidity');
  });

  it('has slots for prefix and suffix', () => {
    const r = assertCompiles('fl-input');
    assert.ok(r.output.includes('name="prefix"'), 'should have prefix slot');
    assert.ok(r.output.includes('name="suffix"'), 'should have suffix slot');
  });
});

// ============================================================
// fl-card
// ============================================================

describe('fl-card', () => {
  it('has variant/padding/clickable props', () => {
    const r = assertCompiles('fl-card');
    assert.ok(r.output.includes('variant'));
    assert.ok(r.output.includes('padding'));
    assert.ok(r.output.includes('clickable'));
  });

  it('has header/footer/default slots', () => {
    const r = assertCompiles('fl-card');
    assert.ok(r.output.includes('name="header"'), 'header slot');
    assert.ok(r.output.includes('name="footer"'), 'footer slot');
    assert.ok(r.output.includes('<slot></slot>') || r.output.includes('<slot>'), 'default slot');
  });
});

// ============================================================
// fl-dialog
// ============================================================

describe('fl-dialog', () => {
  it('has open/title/closable/size props', () => {
    const r = assertCompiles('fl-dialog');
    assert.ok(r.output.includes('open'));
    assert.ok(r.output.includes('title'));
    assert.ok(r.output.includes('closable'));
  });

  it('has dialog ARIA attributes', () => {
    const r = assertCompiles('fl-dialog');
    assert.ok(r.output.includes('role="dialog"'), 'should have dialog role');
    assert.ok(r.output.includes('aria-modal'), 'should have aria-modal');
  });

  it('emits close event', () => {
    const r = assertCompiles('fl-dialog');
    assert.ok(r.output.includes("'close'"), 'should emit close');
  });

  it('includes animation keyframes', () => {
    const r = assertCompiles('fl-dialog');
    assert.ok(r.output.includes('fl-dialog-fade') || r.output.includes('@keyframes'), 'should have animations');
  });
});

// ============================================================
// fl-badge
// ============================================================

describe('fl-badge', () => {
  it('has variant/size/pill/dot props', () => {
    const r = assertCompiles('fl-badge');
    assert.ok(r.output.includes('variant'));
    assert.ok(r.output.includes('pill'));
    assert.ok(r.output.includes('dot'));
  });

  it('supports 5 color variants in CSS', () => {
    const r = assertCompiles('fl-badge');
    assert.ok(r.output.includes('fl-badge--primary'));
    assert.ok(r.output.includes('fl-badge--success'));
    assert.ok(r.output.includes('fl-badge--warning'));
    assert.ok(r.output.includes('fl-badge--danger'));
  });
});

// ============================================================
// fl-alert
// ============================================================

describe('fl-alert', () => {
  it('has role="alert"', () => {
    const r = assertCompiles('fl-alert');
    assert.ok(r.output.includes('role="alert"'));
  });

  it('supports dismissible', () => {
    const r = assertCompiles('fl-alert');
    assert.ok(r.output.includes("'dismiss'"), 'should emit dismiss');
  });

  it('supports 4 variants', () => {
    const r = assertCompiles('fl-alert');
    assert.ok(r.output.includes('fl-alert--info'));
    assert.ok(r.output.includes('fl-alert--success'));
    assert.ok(r.output.includes('fl-alert--warning'));
    assert.ok(r.output.includes('fl-alert--error'));
  });
});

// ============================================================
// fl-tabs
// ============================================================

describe('fl-tabs', () => {
  it('has items/active/variant props', () => {
    const r = assertCompiles('fl-tabs');
    assert.ok(r.output.includes('items'));
    assert.ok(r.output.includes('active'));
    assert.ok(r.output.includes('variant'));
  });

  it('has tablist ARIA role', () => {
    const r = assertCompiles('fl-tabs');
    assert.ok(r.output.includes('role="tablist"'));
    assert.ok(r.output.includes('role="tab"') || r.output.includes('role=\\"tab\\"'));
  });

  it('emits change event', () => {
    const r = assertCompiles('fl-tabs');
    assert.ok(r.output.includes("'change'"));
  });
});

// ============================================================
// fl-spinner
// ============================================================

describe('fl-spinner', () => {
  it('has SVG animation', () => {
    const r = assertCompiles('fl-spinner');
    assert.ok(r.output.includes('fl-spinner-rotate') || r.output.includes('@keyframes'));
  });

  it('has accessible role="status"', () => {
    const r = assertCompiles('fl-spinner');
    assert.ok(r.output.includes('role="status"'));
  });

  it('supports color prop', () => {
    const r = assertCompiles('fl-spinner');
    assert.ok(r.output.includes('color'));
  });
});

// ============================================================
// fl-toggle
// ============================================================

describe('fl-toggle', () => {
  it('is form-associated', () => {
    const r = assertCompiles('fl-toggle');
    assert.ok(r.output.includes('formAssociated'));
    assert.ok(r.output.includes('attachInternals'));
  });

  it('has switch role', () => {
    const r = assertCompiles('fl-toggle');
    assert.ok(r.output.includes('role="switch"'));
  });

  it('emits change event', () => {
    const r = assertCompiles('fl-toggle');
    assert.ok(r.output.includes("'change'"));
  });

  it('supports checked/disabled/label/size props', () => {
    const r = assertCompiles('fl-toggle');
    assert.ok(r.output.includes('checked'));
    assert.ok(r.output.includes('disabled'));
    assert.ok(r.output.includes('label'));
  });
});

// ============================================================
// Bundle test
// ============================================================

describe('chasket-ui bundle', () => {
  it('build produces a combined bundle', () => {
    // Run build first to ensure dist/ exists (CI has clean checkout)
    const { execFileSync } = require('node:child_process');
    execFileSync(process.execPath, [path.join(__dirname, '..', 'build.js')], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });

    const bundlePath = path.join(__dirname, '..', 'dist', 'chasket-ui.js');
    assert.ok(fs.existsSync(bundlePath), 'dist/chasket-ui.js should exist');

    const bundle = fs.readFileSync(bundlePath, 'utf-8');
    assert.ok(bundle.includes('fl-button'), 'bundle should include fl-button');
    assert.ok(bundle.includes('fl-input'), 'bundle should include fl-input');
    assert.ok(bundle.includes('fl-dialog'), 'bundle should include fl-dialog');
    assert.ok(bundle.length > 5000, 'bundle should have substantial content');
  });
});
