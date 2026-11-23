/**
 * Evidence screenshots: red boxes + numbered labels drawn over the app, for BUGS.md.
 *
 * Boxes are drawn in the launcher (top) document with position:fixed, so they can mark elements inside the
 * game iframe too (each element's rect is offset by every frame between it and the launcher).
 * They are measured and drawn in cy.screenshot's onBeforeScreenshot hook - the moment before capture - so
 * layout changes or animations before the capture can't leave a box out of place.
 */

const ATTR = 'data-evidence';
const RED = '#e00000';

export type Placement = 'above' | 'below' | 'left' | 'right';

export interface Mark {
  /** Element(s) to box. Several elements are boxed together as one rectangle. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: Cypress.Chainable<JQuery<any>>;
  label: string;
  placement?: Placement;
  pad?: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectIn(topDoc: Document, el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let doc = el.ownerDocument;
  while (doc !== topDoc) {
    const frame = doc.defaultView?.frameElement as HTMLElement | null;
    if (!frame) break;
    const fr = frame.getBoundingClientRect();
    left += fr.left + frame.clientLeft;
    top += fr.top + frame.clientTop;
    doc = frame.ownerDocument;
  }
  return { left, top, right: left + r.width, bottom: top + r.height };
}

function addEl(doc: Document, css: Partial<CSSStyleDeclaration>, text?: string) {
  const el = doc.createElement('div');
  el.setAttribute(ATTR, '');
  Object.assign(el.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', boxSizing: 'border-box' }, css);
  if (text) el.textContent = text;
  doc.body.appendChild(el);
  return el;
}

function draw(doc: Document, title: string, marks: { els: HTMLElement[]; label: string; placement: Placement; pad: number }[]) {
  const vw = doc.documentElement.clientWidth;
  const vh = doc.documentElement.clientHeight;
  addEl(doc, {
    left: '0', top: '0', right: '0', background: RED, color: '#fff', padding: '7px 14px',
    font: 'bold 17px/1.3 Segoe UI, Arial, sans-serif', textAlign: 'center',
  }, title);

  marks.forEach((m, i) => {
    const rects = m.els.map((el) => rectIn(doc, el));
    const r = {
      left: Math.min(...rects.map((x) => x.left)) - m.pad,
      top: Math.min(...rects.map((x) => x.top)) - m.pad,
      right: Math.max(...rects.map((x) => x.right)) + m.pad,
      bottom: Math.max(...rects.map((x) => x.bottom)) + m.pad,
    };
    addEl(doc, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px`,
      border: `3px solid ${RED}`, borderRadius: '6px', boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
    });
    const tag = addEl(doc, {
      background: RED, color: '#fff', font: 'bold 14px/1.3 Segoe UI, Arial, sans-serif', padding: '6px 9px',
      borderRadius: '5px', maxWidth: '380px', whiteSpace: 'pre-line', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }, `${i + 1}. ${m.label}`);
    const w = tag.offsetWidth;
    const h = tag.offsetHeight;
    const gap = 6;
    let left = r.left;
    let top = r.bottom + gap;
    if (m.placement === 'above') top = r.top - h - gap;
    if (m.placement === 'left') { left = r.left - w - gap; top = r.top; }
    if (m.placement === 'right') { left = r.right + gap; top = r.top; }
    tag.style.left = `${Math.max(4, Math.min(left, vw - w - 4))}px`;
    tag.style.top = `${Math.max(36, Math.min(top, vh - h - 4))}px`;
  });
}

/** Take a viewport screenshot `name` with a red title banner and numbered red boxes; the overlay is removed afterwards. */
export function evidence(name: string, title: string, marks: Mark[]) {
  const resolved: { els: HTMLElement[]; label: string; placement: Placement; pad: number }[] = [];
  marks.forEach((m) =>
    m.target.then(($els) => {
      expect($els.length, `element for mark "${m.label}"`).to.be.greaterThan(0);
      resolved.push({ els: $els.toArray(), label: m.label, placement: m.placement ?? 'below', pad: m.pad ?? 4 });
    }),
  );
  cy.document({ log: false }).then((doc) => {
    cy.screenshot(name, {
      capture: 'viewport',
      overwrite: true,
      onBeforeScreenshot: () => draw(doc, title, resolved),
      onAfterScreenshot: () => doc.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove()),
    });
  });
}

// ---- real (trusted) input via the Chrome DevTools Protocol - Chromium/Electron only ----------------------

/** The <iframe> hosting `win`. Cypress hides `frameElement` inside the app under test, so look that one up. */
function hostFrame(win: Window): HTMLElement | null {
  if (win.frameElement) return win.frameElement as HTMLElement;
  const aut = window.top?.document.querySelector<HTMLIFrameElement>('iframe.aut-iframe');
  return aut && aut.contentWindow === win ? aut : null;
}

function centreInRunner(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  let x = r.left + r.width / 2;
  let y = r.top + r.height / 2;
  let win = el.ownerDocument.defaultView!;
  for (let frame = hostFrame(win); frame; frame = hostFrame(win)) {
    const fr = frame.getBoundingClientRect();
    const sx = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
    const sy = frame.offsetHeight ? fr.height / frame.offsetHeight : 1;
    x = fr.left + (frame.clientLeft + x) * sx;
    y = fr.top + (frame.clientTop + y) * sy;
    win = frame.ownerDocument.defaultView!;
  }
  return { x, y };
}

const cdp = (command: string, params: Record<string, unknown>) =>
  Cypress.automation('remote:debugger:protocol', { command, params });

/** A trusted mouse click. Unlike cy.click(), it moves real keyboard focus into the element's frame. */
export function realClick($el: JQuery<HTMLElement>) {
  const { x, y } = centreInRunner($el[0]);
  return cy
    .wrap(null, { log: false })
    .then(() => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }))
    .then(() => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }));
}

/** A trusted Space key press. The game ignores synthetic KeyboardEvents, so its hotkeys need real input. */
export function realSpace() {
  const key = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  return cy
    .wrap(null, { log: false })
    .then(() => cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: ' ', ...key }))
    .then(() => cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...key }));
}
