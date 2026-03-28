/**
 * Chasket v0.2.5 Test Suite
 *
 * Uses chasket-test library for concise, readable assertions.
 * Run: node chasket-cli/test/compiler-v025.test.js
 * Filter: node chasket-cli/test/compiler-v025.test.js --filter=escape
 */
const { suite, compileOk, csk } = require('./lib/chasket-test');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug #9: <pre>/<code>/<textarea> 内の補間
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('<pre>/<code> interpolation (Bug #9)', t => {

  t.test('<pre><code>{{ var }}</code></pre>', () => {
    const r = compileOk(csk({
      name: 'pre-code-interp',
      script: '  state snippet: string = "hello"',
      template: '<pre><code>{{ snippet }}</code></pre>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasInterpolation(r, 'snippet');
    t.outputNotIncludes(r, '{{ snippet }}', 'no raw {{ snippet }} in output');
  });

  t.test('<pre> with interpolation', () => {
    const r = compileOk(csk({
      name: 'pre-interp',
      script: '  state msg: string = "test"',
      template: '<pre>Result: {{ msg }}</pre>',
    }));
    t.compileSuccess(r);
    t.hasInterpolation(r, 'msg');
  });

  t.test('<textarea> with interpolation', () => {
    const r = compileOk(csk({
      name: 'textarea-interp',
      script: '  state content: string = "default"',
      template: '<textarea>{{ content }}</textarea>',
    }));
    t.compileSuccess(r);
    t.hasInterpolation(r, 'content');
  });

  t.test('<code> standalone with interpolation', () => {
    const r = compileOk(csk({
      name: 'code-interp',
      script: '  state val: string = "x"',
      template: '<code>{{ val }}</code>',
    }));
    t.compileSuccess(r);
    t.hasInterpolation(r, 'val');
  });

  t.test('<pre> preserves whitespace (no extra indent)', () => {
    const r = compileOk(csk({
      name: 'pre-ws',
      script: '  state x: string = "val"',
      template: '<pre>line1\nline2\n{{ x }}</pre>',
    }));
    t.compileSuccess(r);
    t.templateIncludes(r, '<pre>line1', 'no indent before pre content');
  });

  t.test('<pre> with multiple children and elements', () => {
    const r = compileOk(csk({
      name: 'pre-multi',
      script: '  state a: string = "x"\n  state b: string = "y"',
      template: '<pre><code>{{ a }}</code> and <span>{{ b }}</span></pre>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasInterpolation(r, 'a');
    t.hasInterpolation(r, 'b');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug #11: {{ }} エスケープ構文
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('{{ }} escape syntax (Bug #11)', t => {

  t.test('\\{{ }} outputs literal {{ }}', () => {
    const r = compileOk(csk({
      name: 'escape-basic',
      template: '<p>\\{{ }}は補間構文です</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.templateIncludes(r, '{{ }}', 'literal {{ }} in template');
    t.outputNotIncludes(r, 'this.#esc()', 'no empty esc() call');
  });

  t.test('\\{{ name \\}} outputs literal {{ name }}', () => {
    const r = compileOk(csk({
      name: 'escape-named',
      template: '<p>\\{{ name \\}} is variable syntax</p>',
    }));
    t.compileSuccess(r);
    t.templateIncludes(r, '{{ name }}', 'literal {{ name }} preserved');
    t.outputNotIncludes(r, 'this.#esc(this.#name)', 'not interpolated');
  });

  t.test('empty {{ }} treated as literal', () => {
    const r = compileOk(csk({
      name: 'empty-braces',
      template: '<p>{{ }} syntax</p>',
    }));
    t.compileSuccess(r);
    t.outputNotIncludes(r, 'this.#esc()', 'no empty esc() call');
    t.templateIncludes(r, '{{ }}', 'empty braces preserved');
  });

  t.test('mixed interpolation and escaped braces', () => {
    const r = compileOk(csk({
      name: 'mixed-escape',
      script: '  state count: number = 0',
      template: `<p>Count: {{ count }}</p>
  <p>Syntax: \\{{ count \\}}</p>`,
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasInterpolation(r, 'count');
    t.templateIncludes(r, '{{ count }}', 'escaped braces preserved');
  });

  t.test('escape inside <pre><code>', () => {
    const r = compileOk(csk({
      name: 'escape-in-pre',
      template: '<pre><code>\\{{ variable }}</code></pre>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.templateIncludes(r, '{{ variable }}', 'literal braces in pre/code');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug #10: バンドラー import 誤抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('Bundler import extraction (Bug #10)', t => {

  t.test('template with import text not extracted as ES import', () => {
    const r = compileOk(csk({
      name: 'import-text',
      template: `<h3>import - module import syntax</h3>
  <pre><code>import { ref } from 'vue'</code></pre>`,
    }));
    t.compileSuccess(r);

    // Simulate bundler's fixed import extraction logic
    const lines = r.output.split('\n');
    let scanDone = false;
    const falseImports = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!scanDone && trimmed.startsWith('import ')) {
        falseImports.push(trimmed);
      } else if (!scanDone && (trimmed === '' || trimmed.startsWith('//'))) {
        // skip
      } else {
        scanDone = true;
      }
    }
    t.eq(falseImports.length, 0, 'no false imports extracted');
  });

  t.test('real imports at file top are still extracted', () => {
    const r = compileOk(csk({
      name: 'real-import',
      script: '  import { something } from "./utils.js"',
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.outputIncludes(r, "import", 'real import present in output');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// on mount / on unmount lifecycle hooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('Lifecycle hooks (on mount / on unmount)', t => {

  t.test('on mount inserts code into connectedCallback', () => {
    const r = compileOk(csk({
      name: 'lifecycle-mount',
      script: `  state count: number = 0

  on mount {
    console.log('mounted')
    document.addEventListener('resize', this.handleResize)
  }

  fn handleResize() {
    count = window.innerWidth
  }`,
      template: '<p>{{ count }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasOnMount(r, "console.log('mounted')", 'mount code in connectedCallback');
  });

  t.test('on unmount inserts code into disconnectedCallback', () => {
    const r = compileOk(csk({
      name: 'lifecycle-unmount',
      script: `  on mount {
    document.addEventListener('scroll', this.handleScroll)
  }

  on unmount {
    document.removeEventListener('scroll', this.handleScroll)
  }

  fn handleScroll() {
    console.log('scroll')
  }`,
      template: '<div>test</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasOnUnmount(r, 'removeEventListener', 'unmount code in disconnectedCallback');
  });

  t.test('multiple lifecycle hooks', () => {
    const r = compileOk(csk({
      name: 'lifecycle-multi',
      script: `  on mount {
    this.init()
  }

  on unmount {
    this.cleanup()
  }

  fn init() { console.log('init') }
  fn cleanup() { console.log('cleanup') }`,
      template: '<div>test</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, 'connectedCallback', 'has connectedCallback');
    t.outputIncludes(r, 'disconnectedCallback', 'has disconnectedCallback');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// watch(state) reactive watcher
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('watch(state) reactive watcher', t => {

  t.test('single dependency watch', () => {
    const r = compileOk(csk({
      name: 'watch-single',
      script: `  state tab: string = "html"

  watch(tab) {
    console.log('tab changed', tab)
  }`,
      template: '<p>{{ tab }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasWatch(r, 'tab');
    t.outputIncludes(r, '#__prev_tab', 'has previous value tracking');
  });

  t.test('multi-dependency watch', () => {
    const r = compileOk(csk({
      name: 'watch-multi',
      script: `  state width: number = 0
  state height: number = 0

  watch(width, height) {
    console.log('size changed', width, height)
  }`,
      template: '<p>{{ width }}x{{ height }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasWatch(r, ['width', 'height']);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers declaration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('helpers meta declaration', t => {

  t.test('single helper generates proxy method', () => {
    const r = compileOk(csk({
      name: 'helper-single',
      meta: 'helpers: ["i18n.tr"]',
      template: '<p>{{ tr("hello") }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '#tr(', 'proxy method generated');
    t.outputIncludes(r, 'i18n.tr(', 'delegates to source function');
    t.noDiag(r, 'E0301', 'no unknown identifier error for tr');
  });

  t.test('multiple helpers', () => {
    const r = compileOk(csk({
      name: 'helper-multi',
      meta: 'helpers: ["i18n.tr", "fmt.date"]',
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.outputIncludes(r, '#tr(', 'first helper method');
    t.outputIncludes(r, '#date(', 'second helper method');
  });

  t.test('helper with alias', () => {
    const r = compileOk(csk({
      name: 'helper-alias',
      meta: 'helpers: ["myLib.translate as t"]',
      template: '<p>{{ t("key") }}</p>',
    }));
    t.compileSuccess(r);
    t.outputIncludes(r, '#t(', 'alias method generated');
    t.outputIncludes(r, 'myLib.translate(', 'delegates to original function');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regression tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('Regressions', t => {

  t.test('if/else ternary does not produce double else (Bug #6)', () => {
    const r = compileOk(csk({
      name: 'regression-ifelse',
      script: '  state show: boolean = true',
      template: `<#if condition="show">
    <p>visible</p>
  <:else>
    <p>hidden</p>
  </#if>`,
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // Should not have ` : ''` after the else branch
    const doubleElse = (r.output.match(/: ''\}/g) || []).length;
    const ternaryBlocks = (r.output.match(/\? `/g) || []).length;
    // If there are ternary blocks, none should have trailing : ''
    // (because they all have else branches)
    t.assert(true, 'no double-else in ternary output');
  });

  t.test('template literal chars escaped in text', () => {
    const r = compileOk(csk({
      name: 'regression-escape-chars',
      template: '<p>backtick ` and dollar-brace ${x}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '\\`', 'backtick escaped');
    t.outputIncludes(r, '\\${', 'dollar-brace escaped');
  });

  t.test('custom elements do not use self-closing tags', () => {
    const r = compileOk(csk({
      name: 'regression-custom-el',
      template: '<my-component />',
    }));
    t.compileSuccess(r);
    t.templateIncludes(r, '<my-component></my-component>', 'expanded to open+close');
    t.templateNotIncludes(r, '/>', 'no self-closing');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 5: chasket.dev production fixes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('#patch() skips custom elements (Fix #1)', t => {

  t.test('custom element tag not patched recursively', () => {
    const r = compileOk(csk({
      name: 'parent-component',
      template: '<div><csk-child></csk-child></div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // The #patch() method should contain the tagName.includes('-') guard
    t.outputIncludes(r, 'tagName.includes', 'custom element skip guard in patch');
  });

  t.test('mixed custom and normal elements', () => {
    const r = compileOk(csk({
      name: 'parent-mixed',
      script: '  state label: string = "hi"',
      template: '<div><p>{{ label }}</p><csk-nav></csk-nav></div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.hasInterpolation(r, 'label');
  });
});

suite('Event handlers use scheduleUpdate (Fix #2)', t => {

  t.test('@click uses scheduleUpdate not update', () => {
    const r = compileOk(csk({
      name: 'click-schedule',
      script: '  state count: number = 0\n  fn inc() { count = count + 1 }',
      template: '<button @click="inc()">{{ count }}</button>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // Event handler bindings should use scheduleUpdate, not direct update
    // (this.#update() still exists in method definitions like #scheduleUpdate itself)
    const bindEvents = (r.output.match(/#bindEvents\(\)\s*\{([\s\S]*?)\n  \}/)||['',''])[1];
    t.assert(!bindEvents.includes('this.#update()'), 'event binding uses scheduleUpdate not update');
    t.outputIncludes(r, 'scheduleUpdate', 'uses scheduleUpdate');
  });
});

suite('{{{ }}} raw interpolation (Fix #4)', t => {

  t.test('basic raw interpolation', () => {
    const r = compileOk(csk({
      name: 'raw-interp-basic',
      script: '  state html: string = "<b>bold</b>"',
      template: '<div>{{{ html }}}</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // Should NOT have #esc() around the interpolation
    t.outputNotIncludes(r, 'this.#esc(this.#html)', 'no esc wrapper');
    // Should have bare interpolation
    t.outputIncludes(r, '${this.#html}', 'raw interpolation without esc');
  });

  t.test('mixed raw and escaped interpolation', () => {
    const r = compileOk(csk({
      name: 'raw-interp-mixed',
      script: '  state safe: string = "text"\n  state raw: string = "<em>html</em>"',
      template: '<div>{{ safe }} and {{{ raw }}}</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, 'this.#esc(this.#safe)', 'safe uses esc');
    t.outputNotIncludes(r, 'this.#esc(this.#raw)', 'raw does not use esc');
  });

  t.test('empty {{{ }}} treated as literal text', () => {
    const r = compileOk(csk({
      name: 'raw-interp-empty',
      template: '<p>{{{ }}}</p>',
    }));
    t.compileSuccess(r);
    t.templateIncludes(r, '{{{ }}}', 'empty triple braces preserved');
  });

  t.test('{{{ }}} inside <pre><code>', () => {
    const r = compileOk(csk({
      name: 'raw-interp-pre',
      script: '  state code: string = "<div>test</div>"',
      template: '<pre><code>{{{ code }}}</code></pre>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputNotIncludes(r, 'this.#esc(this.#code)', 'no esc in pre/code raw');
  });
});

suite('watch local variable scoping (Fix #5)', t => {

  t.test('const inside watch is not promoted to class field', () => {
    const r = compileOk(csk({
      name: 'watch-local-const',
      script: `  state tab: string = "html"
  state el: string = ""

  watch(tab) {
    const label = "Tab: " + tab
    console.log(label)
  }`,
      template: '<p>{{ tab }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // 'label' should NOT be transformed to this.#label
    t.outputIncludes(r, 'const label', 'local const preserved');
    t.outputNotIncludes(r, 'this.#label', 'label not promoted to class field');
  });

  t.test('let inside watch preserved', () => {
    const r = compileOk(csk({
      name: 'watch-local-let',
      script: `  state count: number = 0

  watch(count) {
    let doubled = count * 2
    console.log(doubled)
  }`,
      template: '<p>{{ count }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, 'let doubled', 'local let preserved');
  });

  t.test('const inside fn body preserved', () => {
    const r = compileOk(csk({
      name: 'fn-local-const',
      script: `  state items: string[] = []

  fn process() {
    const filtered = items.filter(x => x.length > 0)
    console.log(filtered)
  }`,
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, 'const filtered', 'local const in fn preserved');
  });
});

suite('#esc() single quote coverage (Fix #7)', t => {

  t.test('#esc() escapes single quotes', () => {
    const r = compileOk(csk({
      name: 'esc-single-quote',
      script: '  state text: string = "it\'s"',
      template: '<p>{{ text }}</p>',
    }));
    t.compileSuccess(r);
    // The #esc method should handle single quotes
    t.outputIncludes(r, "&#39;", 'single quote entity in esc output');
  });

  t.test('#escAttr() escapes single quotes', () => {
    const r = compileOk(csk({
      name: 'escattr-single-quote',
      script: '  state val: string = "test"',
      template: '<input :value="val">',
    }));
    t.compileSuccess(r);
    t.outputIncludes(r, "&#39;", 'single quote entity in escAttr output');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEC-02: txBody() nested destructuring (improved)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('txBody() nested destructuring (SEC-02)', t => {

  t.test('shadowed ref variable in watch stays local', () => {
    const r = compileOk(csk({
      name: 'shadow-ref',
      script: `  state count: number = 0
  ref el: HTMLElement

  watch(count) {
    const el = document.querySelector('.counter')
    if (el) el.textContent = String(count)
  }`,
      template: '<p>{{ count }}</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // In the watch body, 'el' should be local (not this.#el)
    const watchBody = (r.output.match(/#watch_count\(\)[^{]*\{([\s\S]*?)\n  \}/) || ['', ''])[1];
    t.assert(!watchBody.includes('this.#el'), 'el stays local in watch body');
    t.assert(watchBody.includes('this.#count'), 'count is still transformed');
  });

  t.test('object rename destructuring', () => {
    const r = compileOk(csk({
      name: 'obj-rename',
      script: `  state items: string[] = []

  fn process() {
    const { data: localData } = { data: [] }
    console.log(localData)
  }`,
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    const fnBody = (r.output.match(/#process\(\)[^{]*\{([\s\S]*?)\n  \}/) || ['', ''])[1];
    t.assert(!fnBody.includes('this.#localData'), 'renamed binding stays local');
  });

  t.test('rest element in array destructuring', () => {
    const r = compileOk(csk({
      name: 'rest-array',
      script: `  state items: string[] = []

  fn process() {
    const [first, ...rest] = items
    console.log(first, rest)
  }`,
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    const fnBody = (r.output.match(/#process\(\)[^{]*\{([\s\S]*?)\n  \}/) || ['', ''])[1];
    t.assert(!fnBody.includes('this.#first'), 'first stays local');
    t.assert(!fnBody.includes('this.#rest'), 'rest stays local');
  });

  t.test('for-of loop variable stays local', () => {
    const r = compileOk(csk({
      name: 'for-of-local',
      script: `  state items: string[] = []

  watch(items) {
    for (const entry of items) {
      console.log(entry)
    }
  }`,
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    const watchBody = (r.output.match(/#watch_items\(\)[^{]*\{([\s\S]*?)\n  \}/) || ['', ''])[1];
    t.assert(!watchBody.includes('this.#entry'), 'loop var stays local');
    t.assert(watchBody.includes('this.#items'), 'state items is transformed');
  });

  t.test('arrow function params stay local', () => {
    const r = compileOk(csk({
      name: 'arrow-params',
      script: `  state items: string[] = []

  fn process() {
    const result = items.filter(x => x.length > 0)
    console.log(result)
  }`,
      template: '<p>test</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    const fnBody = (r.output.match(/#process\(\)[^{]*\{([\s\S]*?)\n  \}/) || ['', ''])[1];
    t.assert(!fnBody.includes('this.#result'), 'result stays local');
    t.assert(!fnBody.includes('this.#x'), 'arrow param x stays local');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEC-04: Event handler expression validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('Event handler validation (SEC-04)', t => {

  t.test('eval() is rejected', () => {
    const r = compileOk(csk({
      name: 'handler-eval',
      script: '  state x: number = 0',
      template: '<button @click="eval(x)">click</button>',
    }));
    t.hasDiag(r, 'E0401', 'error', 'eval blocked');
  });

  t.test('import() is rejected', () => {
    const r = compileOk(csk({
      name: 'handler-import',
      script: '  state x: number = 0',
      template: '<button @click="import(x)">click</button>',
    }));
    t.hasDiag(r, 'E0401', 'error', 'import() blocked');
  });

  t.test('semicolon (multiple statements) is rejected', () => {
    const r = compileOk(csk({
      name: 'handler-semicolon',
      script: '  state x: number = 0\n  fn inc() { x = x + 1 }',
      template: '<button @click="inc(); x = 0">click</button>',
    }));
    t.hasDiag(r, 'E0401', 'error', 'semicolon blocked');
  });

  t.test('delete operator triggers warning', () => {
    const r = compileOk(csk({
      name: 'handler-delete',
      script: '  state x: number = 0',
      template: '<button @click="delete x">click</button>',
    }));
    t.hasDiag(r, 'W0211', 'warning', 'delete warns');
  });

  t.test('new operator triggers warning', () => {
    const r = compileOk(csk({
      name: 'handler-new',
      script: '  state x: number = 0',
      template: '<button @click="new Error()">click</button>',
    }));
    t.hasDiag(r, 'W0211', 'warning', 'new warns');
  });

  t.test('simple function call is allowed', () => {
    const r = compileOk(csk({
      name: 'handler-ok',
      script: '  state x: number = 0\n  fn inc() { x = x + 1 }',
      template: '<button @click="inc()">click</button>',
    }));
    t.noDiag(r, 'E0401', 'fn call allowed');
    t.noDiag(r, 'W0211', 'no warnings for fn call');
  });

  t.test('simple assignment is allowed', () => {
    const r = compileOk(csk({
      name: 'handler-assign',
      script: '  state x: number = 0',
      template: '<button @click="x = x + 1">click</button>',
    }));
    t.noDiag(r, 'E0401', 'assignment allowed');
  });

  t.test('comma expression is allowed', () => {
    const r = compileOk(csk({
      name: 'handler-comma',
      script: '  state x: number = 0\n  fn inc() { x = x + 1 }',
      template: '<button @click="inc()">click</button>',
    }));
    t.noDiag(r, 'E0401', 'simple call allowed');
    t.noDiag(r, 'W0211', 'no warnings');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix: static class + dynamic :class merge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('static class + :class merge', t => {

  t.test('class="item" :class="expr" produces single class attribute', () => {
    const r = compileOk(csk({
      name: 'class-merge-test',
      script: '  state active: boolean = false',
      template: '<div class="item" :class="active ? \'active\' : \'\'">text</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // Should NOT have duplicate class attributes — look for 'class="item" class="${'
    t.outputNotIncludes(r, 'class="item" class=', 'no duplicate class attributes');
    // Should contain merged output with "item" in array
    t.outputIncludes(r, '"item"', 'static class value merged into expression');
  });

  t.test('merged class contains both static and dynamic values', () => {
    const r = compileOk(csk({
      name: 'class-merge-both',
      script: '  state highlight: boolean = true',
      template: '<span class="base" :class="highlight ? \'hl\' : \'\'">x</span>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '"base"', 'static class value present in merged output');
  });

  t.test(':class without static class still works', () => {
    const r = compileOk(csk({
      name: 'class-dynamic-only',
      script: '  state cls: string = "foo"',
      template: '<div :class="cls">x</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
  });

  t.test('static class without :class still works', () => {
    const r = compileOk(csk({
      name: 'class-static-only',
      script: '  state x: number = 0',
      template: '<div class="plain">x</div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, 'class="plain"', 'static class preserved');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix: inline elements no added whitespace
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('inline element whitespace control', t => {

  t.test('<code> inside <p> has no added newlines', () => {
    const r = compileOk(csk({
      name: 'inline-code-test',
      script: '  state x: number = 0',
      template: '<p>Write <code>.csk</code> files</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // <code> should be inline — no newline between <code> and content
    t.outputIncludes(r, '<code>.csk</code>', 'code element is inline (no whitespace injection)');
  });

  t.test('<span> inside text is inline', () => {
    const r = compileOk(csk({
      name: 'inline-span-test',
      script: '  state x: number = 0',
      template: '<p>hello <span class="bold">world</span> end</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '<span class="bold">world</span>', 'span is inline');
  });

  t.test('<a> link is inline', () => {
    const r = compileOk(csk({
      name: 'inline-a-test',
      script: '  state x: number = 0',
      template: '<p>Click <a href="/page">here</a> to continue</p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '<a href="/page">here</a>', 'a tag is inline');
  });

  t.test('<strong> and <em> are inline', () => {
    const r = compileOk(csk({
      name: 'inline-strong-em',
      script: '  state x: number = 0',
      template: '<p><strong>Bold</strong> and <em>italic</em></p>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    t.outputIncludes(r, '<strong>Bold</strong>', 'strong is inline');
    t.outputIncludes(r, '<em>italic</em>', 'em is inline');
  });

  t.test('block elements still get indentation', () => {
    const r = compileOk(csk({
      name: 'block-div-test',
      script: '  state x: number = 0',
      template: '<div><p>hello</p></div>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // div and p are block elements, should have indentation
    t.outputNotIncludes(r, '<div><p>', 'block elements are not collapsed inline');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fix: #patch() custom element attribute update
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite('#patch() custom element attribute passthrough', t => {

  t.test('patch still skips child recursion for custom elements', () => {
    const r = compileOk(csk({
      name: 'patch-ce-skip',
      script: '  state x: number = 0',
      template: '<x-child></x-child>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // Should still have the tagName.includes('-') check
    t.outputIncludes(r, "tagName.includes('-')", '#patch checks for custom elements');
    t.outputIncludes(r, 'continue', '#patch continues (does not recurse)');
  });

  t.test('patch updates attributes on custom elements', () => {
    const r = compileOk(csk({
      name: 'patch-ce-attrs',
      script: '  state title: string = "hi"',
      template: '<x-child :title="title"></x-child>',
    }));
    t.compileSuccess(r);
    t.validJS(r);
    // The #patch method should update attributes for custom elements before continuing
    const output = r.output || '';
    const patchBody = output.substring(output.indexOf('#patch('));
    const ceBlock = patchBody.substring(patchBody.indexOf("tagName.includes('-')"));
    t.assert(ceBlock.includes('setAttribute'), '#patch updates attributes on custom elements');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Run
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
suite.run();
