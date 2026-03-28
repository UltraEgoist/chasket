// Chasket Demo Components Bundle — auto-generated
"use strict";

// --- fl-accordion.csk ---
(() => {
(() => {
"use strict";

class FlAccordion extends HTMLElement {
  #_open = -1;
  get #open() { return this.#_open; }
  set #open(v) { this.#_open = v; this.#scheduleUpdate(); }
  #updateScheduled = false;
  #shadow;
  #listeners = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#bindEvents();
    this.#bindRefs();
  }

  disconnectedCallback() {
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
  }

  #toggle0() {
    this.#open = this.#open === 0 ? -1 : 0
  }

  #toggle1() {
    this.#open = this.#open === 1 ? -1 : 1
  }

  #toggle2() {
    this.#open = this.#open === 2 ? -1 : 2
  }

  #toggle3() {
    this.#open = this.#open === 3 ? -1 : 3
  }

  #render() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;max-width:640px;margin:0 auto;}.accordion{border:1px solid #334155;border-radius:12px;overflow:hidden;}.item{border-bottom:1px solid #334155;}.item:last-child{border-bottom:none;}.header{width:100%;display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;background:#1e293b;border:none;color:#e2e8f0;font-size:0.95rem;font-weight:600;cursor:pointer;text-align:left;transition:background 0.2s;}.header:hover{background:#263248;}.icon{font-size:0.7rem;transition:transform 0.3s;color:#64748b;}.item--open .icon{transform:rotate(180deg);color:#f97316;}.body{max-height:0;overflow:hidden;transition:max-height 0.3s ease, padding 0.3s ease;}.item--open .body{max-height:200px;padding:0 1.25rem 1rem;}.body p{color:#94a3b8;font-size:0.9rem;line-height:1.6;margin:0;}code{background:#0f172a;color:#fbbf24;padding:0.15rem 0.35rem;border-radius:4px;font-size:0.85em;}</style>
      <div class="accordion">
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 0 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-0" class="header"><span>What is Chasket?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>Chasket is a template-first Web Components framework. You write single-file <code>.csk</code> components and the compiler generates native Web Components with zero runtime dependencies.</p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 1 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-1" class="header"><span>Does it work with React / Vue / Angular?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Yes! Chasket components compile to standard Web Components, which work in any framework or plain HTML. Just include the script and use the custom element tag.
            </p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 2 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-2" class="header"><span>Is Chasket production-ready?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Chasket is currently in beta with 607+ tests and 32 security fixes. It's suitable for internal tools, landing pages, and progressive enhancement of existing sites.
            </p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 3 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-3" class="header"><span>How big is the output?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Zero runtime — just your component code. A typical component compiles to 3-5 KB of vanilla JavaScript with no framework overhead.
            </p>
          </div>
        </div>
      </div>
    `;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;max-width:640px;margin:0 auto;}.accordion{border:1px solid #334155;border-radius:12px;overflow:hidden;}.item{border-bottom:1px solid #334155;}.item:last-child{border-bottom:none;}.header{width:100%;display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;background:#1e293b;border:none;color:#e2e8f0;font-size:0.95rem;font-weight:600;cursor:pointer;text-align:left;transition:background 0.2s;}.header:hover{background:#263248;}.icon{font-size:0.7rem;transition:transform 0.3s;color:#64748b;}.item--open .icon{transform:rotate(180deg);color:#f97316;}.body{max-height:0;overflow:hidden;transition:max-height 0.3s ease, padding 0.3s ease;}.item--open .body{max-height:200px;padding:0 1.25rem 1rem;}.body p{color:#94a3b8;font-size:0.9rem;line-height:1.6;margin:0;}code{background:#0f172a;color:#fbbf24;padding:0.15rem 0.35rem;border-radius:4px;font-size:0.85em;}</style>
      <div class="accordion">
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 0 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-0" class="header"><span>What is Chasket?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>Chasket is a template-first Web Components framework. You write single-file <code>.csk</code> components and the compiler generates native Web Components with zero runtime dependencies.</p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 1 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-1" class="header"><span>Does it work with React / Vue / Angular?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Yes! Chasket components compile to standard Web Components, which work in any framework or plain HTML. Just include the script and use the custom element tag.
            </p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 2 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-2" class="header"><span>Is Chasket production-ready?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Chasket is currently in beta with 607+ tests and 32 security fixes. It's suitable for internal tools, landing pages, and progressive enhancement of existing sites.
            </p>
          </div>
        </div>
        <div class="${this.#escAttr(["item", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#open === 3 ? 'item--open' : '')].filter(Boolean).join(' '))}">
          <button data-chasket-id="fl-3" class="header"><span>How big is the output?</span><span class="icon">&#x25BC;</span></button>
          <div class="body">
            <p>
              Zero runtime — just your component code. A typical component compiles to 3-5 KB of vanilla JavaScript with no framework overhead.
            </p>
          </div>
        </div>
      </div>
    `;
    return tpl.content;
  }

  #patch(parent, newContent) {
    const newNodes = Array.from(newContent.childNodes);
    const oldNodes = Array.from(parent.childNodes);
    const max = Math.max(oldNodes.length, newNodes.length);
    for (let i = 0; i < max; i++) {
      const o = oldNodes[i], n = newNodes[i];
      if (!n) { parent.removeChild(o); continue; }
      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
        parent.replaceChild(n.cloneNode(true), o); continue;
      }
      if (o.nodeType === 3) {
        if (o.textContent !== n.textContent) o.textContent = n.textContent;
        continue;
      }
      if (o.nodeType === 1) {
        const oA = o.attributes, nA = n.attributes;
        for (let j = nA.length - 1; j >= 0; j--) {
          const a = nA[j];
          if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
        }
        for (let j = oA.length - 1; j >= 0; j--) {
          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
        }
        if (o.tagName === 'STYLE') {
          if (o.textContent !== n.textContent) o.textContent = n.textContent;
          continue;
        }
        if (o.tagName.includes('-')) {
          for (let j = nA.length - 1; j >= 0; j--) {
            const a = nA[j];
            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
          }
          for (let j = oA.length - 1; j >= 0; j--) {
            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
          }
          continue;
        }
        this.#patch(o, n);
      }
    }
  }

  #bindEvents() {
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-0"]');
      if (el) {
        const fn_click = (e) => { this.#toggle0(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-1"]');
      if (el) {
        const fn_click = (e) => { this.#toggle1(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-2"]');
      if (el) {
        const fn_click = (e) => { this.#toggle2(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-3"]');
      if (el) {
        const fn_click = (e) => { this.#toggle3(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
  }

  #bindRefs() {
  }

  #scheduleUpdate() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#update();
    });
  }

  #update() {
    this.#updateScheduled = false;
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
    this.#bindRefs();
  }

  #updateKeepFocus(focusedEl) {
    this.#update();
  }

  #escAttr(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"'`\n\r]/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;');
  }

}

if (typeof __chasketClasses !== 'undefined') {
  __chasketClasses['fl-accordion'] = FlAccordion;
}
if (typeof __chasketDefineQueue !== 'undefined') {
  __chasketDefineQueue.push(['fl-accordion', FlAccordion]);
} else if (!customElements.get('fl-accordion')) {
  customElements.define('fl-accordion', FlAccordion);
}

})();
})();

// --- fl-contact-form.csk ---
(() => {
(() => {
"use strict";

class FlContactForm extends HTMLElement {
  #_name = "";
  get #name() { return this.#_name; }
  set #name(v) { this.#_name = v; this.#scheduleUpdate(); }
  #_email = "";
  get #email() { return this.#_email; }
  set #email(v) { this.#_email = v; this.#scheduleUpdate(); }
  #_message = "";
  get #message() { return this.#_message; }
  set #message(v) { this.#_message = v; this.#scheduleUpdate(); }
  #_submitted = false;
  get #submitted() { return this.#_submitted; }
  set #submitted(v) { this.#_submitted = v; this.#scheduleUpdate(); }
  #_errors = "";
  get #errors() { return this.#_errors; }
  set #errors(v) { this.#_errors = v; this.#scheduleUpdate(); }
  #updateScheduled = false;
  #shadow;
  #listeners = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#bindEvents();
    this.#bindRefs();
  }

  disconnectedCallback() {
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
  }

  get #showForm() { return !this.#submitted; }

  get #hasErrors() { return this.#errors.length > 0; }

  #validate() {
    if (!this.#name.trim()) { this.#errors = "Name is required"; return }
        if (!this.#email.trim() || !this.#email.includes('@')) { this.#errors = "Valid email is required"; return }
        if (!this.#message.trim()) { this.#errors = "Message is required"; return }
        this.#errors = ""
        this.#submitted = true
  }

  #render() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.form-card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:2rem;max-width:440px;margin:0 auto;}h3{color:#f8fafc;margin:0 0 0.25rem;font-size:1.4rem;}.subtitle{color:#94a3b8;margin:0 0 1.5rem;font-size:0.9rem;}.field{margin-bottom:1rem;}label{display:block;color:#cbd5e1;font-size:0.85rem;font-weight:600;margin-bottom:0.35rem;}input, textarea{width:100%;padding:0.6rem 0.75rem;background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;font-size:0.9rem;font-family:inherit;box-sizing:border-box;transition:border-color 0.2s;}input:focus, textarea:focus{outline:none;border-color:#f97316;}textarea{resize:vertical;}button{width:100%;padding:0.75rem;background:#f97316;border:none;border-radius:8px;color:#0f172a;font-size:0.95rem;font-weight:700;cursor:pointer;transition:background 0.2s;margin-top:0.5rem;}button:hover{background:#fb923c;}.error{background:#7f1d1d;color:#fca5a5;padding:0.6rem 0.75rem;border-radius:8px;font-size:0.85rem;margin-bottom:1rem;}.success{text-align:center;padding:2rem 0;}.success-icon{font-size:3rem;margin-bottom:1rem;color:#22c55e;}.success h3{font-size:1.5rem;}.success p{color:#94a3b8;}</style>
      <div class="form-card">
        ${this.#showForm ? `
          <h3>
            Contact Us
          </h3>
          <p class="subtitle">
            We'd love to hear from you
          </p>
          ${this.#hasErrors ? `
            <div class="error">
              ${this.#esc(this.#errors)}
            </div>
          ` : ''}
          <div class="field"><label>Name</label><input data-chasket-id="fl-0" type="text" value="${this.#escAttr(this.#name)}" placeholder="Your name" />
</div>
          <div class="field"><label>Email</label><input data-chasket-id="fl-1" type="email" value="${this.#escAttr(this.#email)}" placeholder="you@example.com" />
</div>
          <div class="field"><label>Message</label><textarea data-chasket-id="fl-2" value="${this.#escAttr(this.#message)}" placeholder="How can we help?" rows="4"></textarea>
</div>
          <button data-chasket-id="fl-3">
            Send Message
          </button>
        ` : `
          <div class="success">
            <div class="success-icon">
              &#x2714;
            </div>
            <h3>
              Thank you!
            </h3>
            <p>
              We'll get back to you soon.
            </p>
          </div>
        `}
      </div>
    `;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.form-card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:2rem;max-width:440px;margin:0 auto;}h3{color:#f8fafc;margin:0 0 0.25rem;font-size:1.4rem;}.subtitle{color:#94a3b8;margin:0 0 1.5rem;font-size:0.9rem;}.field{margin-bottom:1rem;}label{display:block;color:#cbd5e1;font-size:0.85rem;font-weight:600;margin-bottom:0.35rem;}input, textarea{width:100%;padding:0.6rem 0.75rem;background:#0f172a;border:1px solid #475569;border-radius:8px;color:#e2e8f0;font-size:0.9rem;font-family:inherit;box-sizing:border-box;transition:border-color 0.2s;}input:focus, textarea:focus{outline:none;border-color:#f97316;}textarea{resize:vertical;}button{width:100%;padding:0.75rem;background:#f97316;border:none;border-radius:8px;color:#0f172a;font-size:0.95rem;font-weight:700;cursor:pointer;transition:background 0.2s;margin-top:0.5rem;}button:hover{background:#fb923c;}.error{background:#7f1d1d;color:#fca5a5;padding:0.6rem 0.75rem;border-radius:8px;font-size:0.85rem;margin-bottom:1rem;}.success{text-align:center;padding:2rem 0;}.success-icon{font-size:3rem;margin-bottom:1rem;color:#22c55e;}.success h3{font-size:1.5rem;}.success p{color:#94a3b8;}</style>
      <div class="form-card">
        ${this.#showForm ? `
          <h3>
            Contact Us
          </h3>
          <p class="subtitle">
            We'd love to hear from you
          </p>
          ${this.#hasErrors ? `
            <div class="error">
              ${this.#esc(this.#errors)}
            </div>
          ` : ''}
          <div class="field"><label>Name</label><input data-chasket-id="fl-0" type="text" value="${this.#escAttr(this.#name)}" placeholder="Your name" />
</div>
          <div class="field"><label>Email</label><input data-chasket-id="fl-1" type="email" value="${this.#escAttr(this.#email)}" placeholder="you@example.com" />
</div>
          <div class="field"><label>Message</label><textarea data-chasket-id="fl-2" value="${this.#escAttr(this.#message)}" placeholder="How can we help?" rows="4"></textarea>
</div>
          <button data-chasket-id="fl-3">
            Send Message
          </button>
        ` : `
          <div class="success">
            <div class="success-icon">
              &#x2714;
            </div>
            <h3>
              Thank you!
            </h3>
            <p>
              We'll get back to you soon.
            </p>
          </div>
        `}
      </div>
    `;
    return tpl.content;
  }

  #patch(parent, newContent) {
    const newNodes = Array.from(newContent.childNodes);
    const oldNodes = Array.from(parent.childNodes);
    const max = Math.max(oldNodes.length, newNodes.length);
    for (let i = 0; i < max; i++) {
      const o = oldNodes[i], n = newNodes[i];
      if (!n) { parent.removeChild(o); continue; }
      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
        parent.replaceChild(n.cloneNode(true), o); continue;
      }
      if (o.nodeType === 3) {
        if (o.textContent !== n.textContent) o.textContent = n.textContent;
        continue;
      }
      if (o.nodeType === 1) {
        const oA = o.attributes, nA = n.attributes;
        for (let j = nA.length - 1; j >= 0; j--) {
          const a = nA[j];
          if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
        }
        for (let j = oA.length - 1; j >= 0; j--) {
          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
        }
        if (o.tagName === 'STYLE') {
          if (o.textContent !== n.textContent) o.textContent = n.textContent;
          continue;
        }
        if (o.tagName.includes('-')) {
          for (let j = nA.length - 1; j >= 0; j--) {
            const a = nA[j];
            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
          }
          for (let j = oA.length - 1; j >= 0; j--) {
            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
          }
          continue;
        }
        this.#patch(o, n);
      }
    }
  }

  #bindEvents() {
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-0"]');
      if (el) {
        const fn_input = (e) => { this.#name = e.target.value; this.#updateKeepFocus(el); };
        el.addEventListener('input', fn_input);
        this.#listeners.push([el, 'input', fn_input]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-1"]');
      if (el) {
        const fn_input = (e) => { this.#email = e.target.value; this.#updateKeepFocus(el); };
        el.addEventListener('input', fn_input);
        this.#listeners.push([el, 'input', fn_input]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-2"]');
      if (el) {
        const fn_input = (e) => { this.#message = e.target.value; this.#updateKeepFocus(el); };
        el.addEventListener('input', fn_input);
        this.#listeners.push([el, 'input', fn_input]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-3"]');
      if (el) {
        const fn_click = (e) => { this.#validate(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
  }

  #bindRefs() {
  }

  #scheduleUpdate() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#update();
    });
  }

  #update() {
    this.#updateScheduled = false;
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
    this.#bindRefs();
  }

  #updateKeepFocus(focusedEl) {
    this.#update();
  }

  #esc(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"']/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  #escAttr(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"'`\n\r]/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;');
  }

}

if (typeof __chasketClasses !== 'undefined') {
  __chasketClasses['fl-contact-form'] = FlContactForm;
}
if (typeof __chasketDefineQueue !== 'undefined') {
  __chasketDefineQueue.push(['fl-contact-form', FlContactForm]);
} else if (!customElements.get('fl-contact-form')) {
  customElements.define('fl-contact-form', FlContactForm);
}

})();
})();

// --- fl-cookie-consent.csk ---
(() => {
(() => {
"use strict";

class FlCookieConsent extends HTMLElement {
  #_visible = true;
  get #visible() { return this.#_visible; }
  set #visible(v) { this.#_visible = v; this.#scheduleUpdate(); }
  #updateScheduled = false;
  #shadow;
  #listeners = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#bindEvents();
    this.#bindRefs();
  }

  disconnectedCallback() {
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
  }

  #accept() {
    this.#visible = false
  }

  #decline() {
    this.#visible = false
  }

  #render() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.banner{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:#1e293b;border-top:1px solid #334155;box-shadow:0 -4px 24px rgba(0,0,0,0.3);animation:slideUp 0.4s ease;}.content{max-width:960px;margin:0 auto;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1.5rem;}p{color:#cbd5e1;font-size:0.875rem;margin:0;line-height:1.5;flex:1;}.actions{display:flex;gap:0.75rem;flex-shrink:0;}.btn-accept{padding:0.55rem 1.25rem;background:#f97316;border:none;border-radius:8px;color:#0f172a;font-weight:700;font-size:0.85rem;cursor:pointer;transition:background 0.2s;}.btn-accept:hover{background:#fb923c;}.btn-decline{padding:0.55rem 1.25rem;background:transparent;border:1px solid #475569;border-radius:8px;color:#94a3b8;font-weight:600;font-size:0.85rem;cursor:pointer;transition:all 0.2s;}.btn-decline:hover{border-color:#94a3b8;color:#e2e8f0;}@keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}@media (max-width:640px){.content{flex-direction:column;text-align:center;}.actions{width:100%;}.actions button{flex:1;}}</style>
      ${this.#visible ? `
        <div class="banner">
          <div class="content">
            <p>
              We use cookies to improve your experience. By continuing to visit this site you agree to our use of cookies.
            </p>
            <div class="actions">
              <button data-chasket-id="fl-0" class="btn-accept">
                Accept All
              </button>
              <button data-chasket-id="fl-1" class="btn-decline">
                Decline
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.banner{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:#1e293b;border-top:1px solid #334155;box-shadow:0 -4px 24px rgba(0,0,0,0.3);animation:slideUp 0.4s ease;}.content{max-width:960px;margin:0 auto;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1.5rem;}p{color:#cbd5e1;font-size:0.875rem;margin:0;line-height:1.5;flex:1;}.actions{display:flex;gap:0.75rem;flex-shrink:0;}.btn-accept{padding:0.55rem 1.25rem;background:#f97316;border:none;border-radius:8px;color:#0f172a;font-weight:700;font-size:0.85rem;cursor:pointer;transition:background 0.2s;}.btn-accept:hover{background:#fb923c;}.btn-decline{padding:0.55rem 1.25rem;background:transparent;border:1px solid #475569;border-radius:8px;color:#94a3b8;font-weight:600;font-size:0.85rem;cursor:pointer;transition:all 0.2s;}.btn-decline:hover{border-color:#94a3b8;color:#e2e8f0;}@keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}@media (max-width:640px){.content{flex-direction:column;text-align:center;}.actions{width:100%;}.actions button{flex:1;}}</style>
      ${this.#visible ? `
        <div class="banner">
          <div class="content">
            <p>
              We use cookies to improve your experience. By continuing to visit this site you agree to our use of cookies.
            </p>
            <div class="actions">
              <button data-chasket-id="fl-0" class="btn-accept">
                Accept All
              </button>
              <button data-chasket-id="fl-1" class="btn-decline">
                Decline
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;
    return tpl.content;
  }

  #patch(parent, newContent) {
    const newNodes = Array.from(newContent.childNodes);
    const oldNodes = Array.from(parent.childNodes);
    const max = Math.max(oldNodes.length, newNodes.length);
    for (let i = 0; i < max; i++) {
      const o = oldNodes[i], n = newNodes[i];
      if (!n) { parent.removeChild(o); continue; }
      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
        parent.replaceChild(n.cloneNode(true), o); continue;
      }
      if (o.nodeType === 3) {
        if (o.textContent !== n.textContent) o.textContent = n.textContent;
        continue;
      }
      if (o.nodeType === 1) {
        const oA = o.attributes, nA = n.attributes;
        for (let j = nA.length - 1; j >= 0; j--) {
          const a = nA[j];
          if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
        }
        for (let j = oA.length - 1; j >= 0; j--) {
          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
        }
        if (o.tagName === 'STYLE') {
          if (o.textContent !== n.textContent) o.textContent = n.textContent;
          continue;
        }
        if (o.tagName.includes('-')) {
          for (let j = nA.length - 1; j >= 0; j--) {
            const a = nA[j];
            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
          }
          for (let j = oA.length - 1; j >= 0; j--) {
            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
          }
          continue;
        }
        this.#patch(o, n);
      }
    }
  }

  #bindEvents() {
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-0"]');
      if (el) {
        const fn_click = (e) => { this.#accept(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-1"]');
      if (el) {
        const fn_click = (e) => { this.#decline(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
  }

  #bindRefs() {
  }

  #scheduleUpdate() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#update();
    });
  }

  #update() {
    this.#updateScheduled = false;
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
    this.#bindRefs();
  }

  #updateKeepFocus(focusedEl) {
    this.#update();
  }

}

if (typeof __chasketClasses !== 'undefined') {
  __chasketClasses['fl-cookie-consent'] = FlCookieConsent;
}
if (typeof __chasketDefineQueue !== 'undefined') {
  __chasketDefineQueue.push(['fl-cookie-consent', FlCookieConsent]);
} else if (!customElements.get('fl-cookie-consent')) {
  customElements.define('fl-cookie-consent', FlCookieConsent);
}

})();
})();

// --- fl-pricing-table.csk ---
(() => {
(() => {
"use strict";

class FlPricingTable extends HTMLElement {
  #_selected = "";
  get #selected() { return this.#_selected; }
  set #selected(v) { this.#_selected = v; this.#scheduleUpdate(); }
  #updateScheduled = false;
  #shadow;
  #listeners = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#bindEvents();
    this.#bindRefs();
  }

  disconnectedCallback() {
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
  }

  #selectStarter() {
    this.#selected = "starter"
  }

  #selectPro() {
    this.#selected = "pro"
  }

  #selectEnterprise() {
    this.#selected = "enterprise"
  }

  #render() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.pricing{display:grid;grid-template-columns:repeat(3, 1fr);gap:1.5rem;max-width:960px;margin:0 auto;}.plan{background:#1e293b;border:2px solid #334155;border-radius:16px;padding:2rem;text-align:center;position:relative;transition:all 0.3s ease;display:flex;flex-direction:column;}.plan:hover{border-color:#64748b;transform:translateY(-4px);}.plan--popular{border-color:#f97316;}.plan--popular:hover{border-color:#fb923c;}.plan--selected{border-color:#22c55e;box-shadow:0 0 24px rgba(34,197,94,0.2);}.plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#f97316;color:#fff;font-size:0.7rem;font-weight:700;padding:0.2rem 0.75rem;border-radius:99px;letter-spacing:0.05em;}.plan-badge:empty{display:none;}h3{color:#f8fafc;font-size:1.3rem;margin:0.5rem 0;}.price{margin:1rem 0;}.amount{font-size:2.5rem;font-weight:800;color:#f8fafc;}.period{font-size:0.9rem;color:#94a3b8;}ul{list-style:none;padding:0;margin:1.5rem 0;flex:1;text-align:left;}li{padding:0.4rem 0;color:#cbd5e1;font-size:0.9rem;}li::before{content:"\2713";color:#22c55e;margin-right:0.5rem;font-weight:700;}button{width:100%;padding:0.75rem;border:2px solid #475569;border-radius:8px;background:transparent;color:#e2e8f0;font-size:0.95rem;font-weight:600;cursor:pointer;transition:all 0.2s;}button:hover{border-color:#94a3b8;background:rgba(255,255,255,0.05);}.btn-primary{background:#f97316;border-color:#f97316;color:#0f172a;}.btn-primary:hover{background:#fb923c;border-color:#fb923c;}@media (max-width:768px){.pricing{grid-template-columns:1fr;max-width:360px;}}</style>
      <div class="pricing">
        <div class="${this.#escAttr(["plan", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'starter' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
          </div>
          <h3>
            Starter
          </h3>
          <div class="price"><span class="amount">$0</span><span class="period">/mo</span></div>
          <ul>
            <li>
              3 projects
            </li>
            <li>
              1 GB storage
            </li>
            <li>
              Community support
            </li>
          </ul>
          <button data-chasket-id="fl-0">
            Get Started
          </button>
        </div>
        <div class="${this.#escAttr(["plan plan--popular", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'pro' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
            POPULAR
          </div>
          <h3>
            Pro
          </h3>
          <div class="price"><span class="amount">$29</span><span class="period">/mo</span></div>
          <ul>
            <li>
              Unlimited projects
            </li>
            <li>
              100 GB storage
            </li>
            <li>
              Priority support
            </li>
            <li>
              API access
            </li>
          </ul>
          <button data-chasket-id="fl-1" class="btn-primary">
            Start Free Trial
          </button>
        </div>
        <div class="${this.#escAttr(["plan", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'enterprise' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
          </div>
          <h3>
            Enterprise
          </h3>
          <div class="price"><span class="amount">$99</span><span class="period">/mo</span></div>
          <ul>
            <li>
              Everything in Pro
            </li>
            <li>
              Unlimited storage
            </li>
            <li>
              Dedicated support
            </li>
            <li>
              SLA guarantee
            </li>
            <li>
              Custom integrations
            </li>
          </ul>
          <button data-chasket-id="fl-2">
            Contact Sales
          </button>
        </div>
      </div>
    `;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.pricing{display:grid;grid-template-columns:repeat(3, 1fr);gap:1.5rem;max-width:960px;margin:0 auto;}.plan{background:#1e293b;border:2px solid #334155;border-radius:16px;padding:2rem;text-align:center;position:relative;transition:all 0.3s ease;display:flex;flex-direction:column;}.plan:hover{border-color:#64748b;transform:translateY(-4px);}.plan--popular{border-color:#f97316;}.plan--popular:hover{border-color:#fb923c;}.plan--selected{border-color:#22c55e;box-shadow:0 0 24px rgba(34,197,94,0.2);}.plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#f97316;color:#fff;font-size:0.7rem;font-weight:700;padding:0.2rem 0.75rem;border-radius:99px;letter-spacing:0.05em;}.plan-badge:empty{display:none;}h3{color:#f8fafc;font-size:1.3rem;margin:0.5rem 0;}.price{margin:1rem 0;}.amount{font-size:2.5rem;font-weight:800;color:#f8fafc;}.period{font-size:0.9rem;color:#94a3b8;}ul{list-style:none;padding:0;margin:1.5rem 0;flex:1;text-align:left;}li{padding:0.4rem 0;color:#cbd5e1;font-size:0.9rem;}li::before{content:"\2713";color:#22c55e;margin-right:0.5rem;font-weight:700;}button{width:100%;padding:0.75rem;border:2px solid #475569;border-radius:8px;background:transparent;color:#e2e8f0;font-size:0.95rem;font-weight:600;cursor:pointer;transition:all 0.2s;}button:hover{border-color:#94a3b8;background:rgba(255,255,255,0.05);}.btn-primary{background:#f97316;border-color:#f97316;color:#0f172a;}.btn-primary:hover{background:#fb923c;border-color:#fb923c;}@media (max-width:768px){.pricing{grid-template-columns:1fr;max-width:360px;}}</style>
      <div class="pricing">
        <div class="${this.#escAttr(["plan", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'starter' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
          </div>
          <h3>
            Starter
          </h3>
          <div class="price"><span class="amount">$0</span><span class="period">/mo</span></div>
          <ul>
            <li>
              3 projects
            </li>
            <li>
              1 GB storage
            </li>
            <li>
              Community support
            </li>
          </ul>
          <button data-chasket-id="fl-0">
            Get Started
          </button>
        </div>
        <div class="${this.#escAttr(["plan plan--popular", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'pro' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
            POPULAR
          </div>
          <h3>
            Pro
          </h3>
          <div class="price"><span class="amount">$29</span><span class="period">/mo</span></div>
          <ul>
            <li>
              Unlimited projects
            </li>
            <li>
              100 GB storage
            </li>
            <li>
              Priority support
            </li>
            <li>
              API access
            </li>
          </ul>
          <button data-chasket-id="fl-1" class="btn-primary">
            Start Free Trial
          </button>
        </div>
        <div class="${this.#escAttr(["plan", ((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#selected === 'enterprise' ? 'plan--selected' : '')].filter(Boolean).join(' '))}">
          <div class="plan-badge">
          </div>
          <h3>
            Enterprise
          </h3>
          <div class="price"><span class="amount">$99</span><span class="period">/mo</span></div>
          <ul>
            <li>
              Everything in Pro
            </li>
            <li>
              Unlimited storage
            </li>
            <li>
              Dedicated support
            </li>
            <li>
              SLA guarantee
            </li>
            <li>
              Custom integrations
            </li>
          </ul>
          <button data-chasket-id="fl-2">
            Contact Sales
          </button>
        </div>
      </div>
    `;
    return tpl.content;
  }

  #patch(parent, newContent) {
    const newNodes = Array.from(newContent.childNodes);
    const oldNodes = Array.from(parent.childNodes);
    const max = Math.max(oldNodes.length, newNodes.length);
    for (let i = 0; i < max; i++) {
      const o = oldNodes[i], n = newNodes[i];
      if (!n) { parent.removeChild(o); continue; }
      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
        parent.replaceChild(n.cloneNode(true), o); continue;
      }
      if (o.nodeType === 3) {
        if (o.textContent !== n.textContent) o.textContent = n.textContent;
        continue;
      }
      if (o.nodeType === 1) {
        const oA = o.attributes, nA = n.attributes;
        for (let j = nA.length - 1; j >= 0; j--) {
          const a = nA[j];
          if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
        }
        for (let j = oA.length - 1; j >= 0; j--) {
          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
        }
        if (o.tagName === 'STYLE') {
          if (o.textContent !== n.textContent) o.textContent = n.textContent;
          continue;
        }
        if (o.tagName.includes('-')) {
          for (let j = nA.length - 1; j >= 0; j--) {
            const a = nA[j];
            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
          }
          for (let j = oA.length - 1; j >= 0; j--) {
            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
          }
          continue;
        }
        this.#patch(o, n);
      }
    }
  }

  #bindEvents() {
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-0"]');
      if (el) {
        const fn_click = (e) => { this.#selectStarter(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-1"]');
      if (el) {
        const fn_click = (e) => { this.#selectPro(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-2"]');
      if (el) {
        const fn_click = (e) => { this.#selectEnterprise(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
  }

  #bindRefs() {
  }

  #scheduleUpdate() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#update();
    });
  }

  #update() {
    this.#updateScheduled = false;
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
    this.#bindRefs();
  }

  #updateKeepFocus(focusedEl) {
    this.#update();
  }

  #escAttr(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"'`\n\r]/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;');
  }

}

if (typeof __chasketClasses !== 'undefined') {
  __chasketClasses['fl-pricing-table'] = FlPricingTable;
}
if (typeof __chasketDefineQueue !== 'undefined') {
  __chasketDefineQueue.push(['fl-pricing-table', FlPricingTable]);
} else if (!customElements.get('fl-pricing-table')) {
  customElements.define('fl-pricing-table', FlPricingTable);
}

})();
})();

// --- fl-toast.csk ---
(() => {
(() => {
"use strict";

class FlToast extends HTMLElement {
  #_visible = false;
  get #visible() { return this.#_visible; }
  set #visible(v) { this.#_visible = v; this.#scheduleUpdate(); }
  #_text = "Notification message here";
  get #text() { return this.#_text; }
  set #text(v) { this.#_text = v; this.#scheduleUpdate(); }
  #_isInfo = true;
  get #isInfo() { return this.#_isInfo; }
  set #isInfo(v) { this.#_isInfo = v; this.#scheduleUpdate(); }
  #_isSuccess = false;
  get #isSuccess() { return this.#_isSuccess; }
  set #isSuccess(v) { this.#_isSuccess = v; this.#scheduleUpdate(); }
  #_isError = false;
  get #isError() { return this.#_isError; }
  set #isError(v) { this.#_isError = v; this.#scheduleUpdate(); }
  #updateScheduled = false;
  #shadow;
  #listeners = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#bindEvents();
    this.#bindRefs();
  }

  disconnectedCallback() {
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
  }

  get #infoClass() { return this.#isInfo ? "toast toast--info" : "toast"; }

  get #successClass() { return this.#isSuccess ? "toast toast--success" : "toast"; }

  get #errorClass() { return this.#isError ? "toast toast--error" : "toast"; }

  #showInfo() {
    this.#text = "This is an info notification"
        this.#isInfo = true
        this.#isSuccess = false
        this.#isError = false
        this.#visible = true
  }

  #showSuccess() {
    this.#text = "Operation completed successfully!"
        this.#isInfo = false
        this.#isSuccess = true
        this.#isError = false
        this.#visible = true
  }

  #showError() {
    this.#text = "Something went wrong. Please try again."
        this.#isInfo = false
        this.#isSuccess = false
        this.#isError = true
        this.#visible = true
  }

  #dismiss() {
    this.#visible = false
  }

  #render() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.demo{position:relative;min-height:120px;}.buttons{display:flex;gap:0.75rem;margin-bottom:1rem;}.buttons button{padding:0.5rem 1rem;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:opacity 0.2s;}.buttons button:hover{opacity:0.85;}.btn-info{background:#1e40af;color:#dbeafe;}.btn-success{background:#166534;color:#dcfce7;}.btn-error{background:#991b1b;color:#fee2e2;}.toast{display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.25rem;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slideIn 0.3s ease;}.toast--info{background:#1e40af;color:#dbeafe;}.toast--success{background:#166534;color:#dcfce7;}.toast--error{background:#991b1b;color:#fee2e2;}.toast-text{flex:1;font-size:0.9rem;font-weight:500;}.toast-close{background:none;border:none;color:inherit;opacity:0.7;cursor:pointer;font-size:1rem;padding:0;}.toast-close:hover{opacity:1;}@keyframes slideIn{from{transform:translateY(-20px);opacity:0;}to{transform:translateY(0);opacity:1;}}</style>
      <div class="demo">
        <div class="buttons">
          <button data-chasket-id="fl-0" class="btn-info">
            Show Info
          </button>
          <button data-chasket-id="fl-1" class="btn-success">
            Show Success
          </button>
          <button data-chasket-id="fl-2" class="btn-error">
            Show Error
          </button>
        </div>
        ${this.#visible ? `
          <div class="${this.#escAttr(((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#isError ? 'toast toast--error' : this.#isSuccess ? 'toast toast--success' : 'toast toast--info'))}"><span class="toast-text">${this.#esc(this.#text)}</span><button data-chasket-id="fl-3" class="toast-close">&#x2715;</button></div>
        ` : ''}
      </div>
    `;
    this.#shadow.replaceChildren(tpl.content.cloneNode(true));
  }

  #getNewTree() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <style>:host{display:block;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;}.demo{position:relative;min-height:120px;}.buttons{display:flex;gap:0.75rem;margin-bottom:1rem;}.buttons button{padding:0.5rem 1rem;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:opacity 0.2s;}.buttons button:hover{opacity:0.85;}.btn-info{background:#1e40af;color:#dbeafe;}.btn-success{background:#166534;color:#dcfce7;}.btn-error{background:#991b1b;color:#fee2e2;}.toast{display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.25rem;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slideIn 0.3s ease;}.toast--info{background:#1e40af;color:#dbeafe;}.toast--success{background:#166534;color:#dcfce7;}.toast--error{background:#991b1b;color:#fee2e2;}.toast-text{flex:1;font-size:0.9rem;font-weight:500;}.toast-close{background:none;border:none;color:inherit;opacity:0.7;cursor:pointer;font-size:1rem;padding:0;}.toast-close:hover{opacity:1;}@keyframes slideIn{from{transform:translateY(-20px);opacity:0;}to{transform:translateY(0);opacity:1;}}</style>
      <div class="demo">
        <div class="buttons">
          <button data-chasket-id="fl-0" class="btn-info">
            Show Info
          </button>
          <button data-chasket-id="fl-1" class="btn-success">
            Show Success
          </button>
          <button data-chasket-id="fl-2" class="btn-error">
            Show Error
          </button>
        </div>
        ${this.#visible ? `
          <div class="${this.#escAttr(((v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' && v !== null ? Object.entries(v).filter(([,b])=>b).map(([k])=>k).join(' ') : String(v || ''))(this.#isError ? 'toast toast--error' : this.#isSuccess ? 'toast toast--success' : 'toast toast--info'))}"><span class="toast-text">${this.#esc(this.#text)}</span><button data-chasket-id="fl-3" class="toast-close">&#x2715;</button></div>
        ` : ''}
      </div>
    `;
    return tpl.content;
  }

  #patch(parent, newContent) {
    const newNodes = Array.from(newContent.childNodes);
    const oldNodes = Array.from(parent.childNodes);
    const max = Math.max(oldNodes.length, newNodes.length);
    for (let i = 0; i < max; i++) {
      const o = oldNodes[i], n = newNodes[i];
      if (!n) { parent.removeChild(o); continue; }
      if (!o) { parent.appendChild(n.cloneNode(true)); continue; }
      if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) {
        parent.replaceChild(n.cloneNode(true), o); continue;
      }
      if (o.nodeType === 3) {
        if (o.textContent !== n.textContent) o.textContent = n.textContent;
        continue;
      }
      if (o.nodeType === 1) {
        const oA = o.attributes, nA = n.attributes;
        for (let j = nA.length - 1; j >= 0; j--) {
          const a = nA[j];
          if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
        }
        for (let j = oA.length - 1; j >= 0; j--) {
          if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
        }
        if (o.tagName === 'STYLE') {
          if (o.textContent !== n.textContent) o.textContent = n.textContent;
          continue;
        }
        if (o.tagName.includes('-')) {
          for (let j = nA.length - 1; j >= 0; j--) {
            const a = nA[j];
            if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
          }
          for (let j = oA.length - 1; j >= 0; j--) {
            if (!n.hasAttribute(oA[j].name)) o.removeAttribute(oA[j].name);
          }
          continue;
        }
        this.#patch(o, n);
      }
    }
  }

  #bindEvents() {
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-0"]');
      if (el) {
        const fn_click = (e) => { this.#showInfo(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-1"]');
      if (el) {
        const fn_click = (e) => { this.#showSuccess(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-2"]');
      if (el) {
        const fn_click = (e) => { this.#showError(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
    {
      const el = this.#shadow.querySelector('[data-chasket-id="fl-3"]');
      if (el) {
        const fn_click = (e) => { this.#dismiss(e); this.#scheduleUpdate(); };
        el.addEventListener('click', fn_click);
        this.#listeners.push([el, 'click', fn_click]);
      }
    }
  }

  #bindRefs() {
  }

  #scheduleUpdate() {
    if (this.#updateScheduled) return;
    this.#updateScheduled = true;
    queueMicrotask(() => {
      this.#updateScheduled = false;
      this.#update();
    });
  }

  #update() {
    this.#updateScheduled = false;
    this.#listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    this.#listeners = [];
    this.#patch(this.#shadow, this.#getNewTree());
    this.#bindEvents();
    this.#bindRefs();
  }

  #updateKeepFocus(focusedEl) {
    this.#update();
  }

  #esc(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"']/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  #escAttr(val) {
    if (val == null) return '';
    const s = String(val);
    if (!/[&<>"'`\n\r]/.test(s)) return s;
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;').replace(/\n/g,'&#10;').replace(/\r/g,'&#13;');
  }

}

if (typeof __chasketClasses !== 'undefined') {
  __chasketClasses['fl-toast'] = FlToast;
}
if (typeof __chasketDefineQueue !== 'undefined') {
  __chasketDefineQueue.push(['fl-toast', FlToast]);
} else if (!customElements.get('fl-toast')) {
  customElements.define('fl-toast', FlToast);
}

})();
})();
