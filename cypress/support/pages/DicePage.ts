import { Direction } from '../oracle/diceMath';

const GAME_IFRAME = '[role="dialog"][aria-label="Joy Dice"] iframe';
const GAME_LOAD_TIMEOUT = 60_000;
const log = { log: false };

/**
 * Page object for the Dice game inside the cross-origin iframe.
 * Every accessor re-queries the iframe body, so Vue re-renders never leave us holding stale nodes.
 * Selectors prefer the game's own data-test-id hooks, then <label for> text; CSS classes are a last resort.
 */
export const DicePage = {
  body(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy
      .get(GAME_IFRAME, log)
      .its('0.contentDocument.body', log)
      .should('not.be.empty')
      // Wrap explicitly in jQuery: `its()` yields a raw element, and should() callbacks expect $-methods.
      .then((body) => cy.wrap(Cypress.$(body as HTMLElement), log));
  },

  byTestId(id: string) {
    return this.body().find(`[data-test-id="${id}"]`);
  },

  inputByLabel(label: RegExp) {
    return this.body()
      .find('label')
      .filter((_, el) => label.test((el.textContent ?? '').trim()))
      .first()
      .invoke('attr', 'for')
      .then((id) => this.body().find(`#${id}`));
  },

  multiplierInput() {
    return this.inputByLabel(/^Multiplier$/);
  },
  targetInput() {
    return this.inputByLabel(/^Roll (Over|Under)$/);
  },
  winChanceInput() {
    return this.inputByLabel(/^Win Chance$/);
  },
  targetStepper(sign: '+' | '−') {
    return this.byTestId('dice-slider-input').contains('button', sign);
  },
  betInput() {
    return this.byTestId('dice-bet-input').find('input');
  },
  betButton() {
    return this.byTestId('dice-bet-button');
  },
  betControlButton(text: string) {
    return this.byTestId('dice-bet-controls')
      .find('button')
      .filter((_, el) => (el.textContent ?? '').trim().toLowerCase() === text.toLowerCase());
  },
  balance() {
    return this.byTestId('footer-balance');
  },
  rollValue() {
    return this.byTestId('dice-roll-value');
  },
  hint() {
    return this.byTestId('dice-hint-message');
  },
  profitOnWin() {
    return this.byTestId('dice-bet-controls').contains('Profits on Win').parent();
  },
  /** Nearest element containing both the "Profits on Win (Nx)" label and its money figure. */
  profitOnWinBlock(): Cypress.Chainable<JQuery<HTMLElement>> {
    const holder = ($label: JQuery<HTMLElement>) => {
      let el: HTMLElement | null = $label[0];
      while (el && !/\)\s*[\d,]+\.\d{4}/.test(el.textContent ?? '')) el = el.parentElement;
      return el;
    };
    return this.byTestId('dice-bet-controls')
      .contains('Profits on Win')
      .should(($label) => expect(holder($label), 'element holding the Profits on Win amount').to.not.equal(null))
      .then(($label) => Cypress.$(holder($label)!));
  },
  /** The money figure shown next to "Profits on Win (Nx)". */
  profitOnWinAmount(): Cypress.Chainable<string> {
    return this.profitOnWinBlock().then(($el) => /\)\s*([\d,]+\.\d{4})/.exec($el.text())![1]);
  },

  /**
   * Game is interactive: balance rendered, multiplier calculated, loading overlay gone and Bet enabled -
   * all at the same moment. Checked in one retried callback because each condition alone is misleading:
   * Bet reports "enabled" while the "Loading game..." overlay still covers it, and the overlay itself is
   * absent for the first ~1.8 s. Loading is network-bound, so it gets GAME_LOAD_TIMEOUT rather than the
   * 15 s UI timeout (a slow dev server once took just over 15 s - see README, reliability).
   */
  waitUntilReady() {
    cy.get(GAME_IFRAME, { ...log, timeout: GAME_LOAD_TIMEOUT }).should(($f) => {
      const doc = ($f[0] as HTMLIFrameElement).contentDocument;
      const q = <T extends Element>(sel: string) => doc?.querySelector<T>(sel) ?? null;
      const balance = q('[data-test-id="footer-balance"]')?.textContent?.trim() ?? '';
      const multLabel = Array.from(doc?.querySelectorAll('label') ?? []).find((l) => l.textContent?.trim() === 'Multiplier');
      const multiplier = multLabel ? (doc!.getElementById(multLabel.htmlFor) as HTMLInputElement | null) : null;
      expect(balance, 'balance rendered').to.match(/^\d[\d,]*\.\d{4}$/);
      expect(Number(multiplier?.value), 'multiplier calculated').to.be.greaterThan(1);
      expect(q('[data-test-id="dice-loading"]'), 'loading overlay gone').to.equal(null);
      expect(q<HTMLButtonElement>('[data-test-id="dice-bet-button"]')?.disabled, 'Bet enabled').to.equal(false);
    });
  },

  historyCount(): Cypress.Chainable<number> {
    return this.body().then(($b) => $b.find('.result-item').length);
  },

  history() {
    return this.body().find('.result-item');
  },

  setDirection(dir: Direction) {
    const text = dir === 'over' ? 'Over' : 'Under';
    this.byTestId('dice-mode-toggle')
      .find('button')
      .filter((_, el) => (el.textContent ?? '').trim() === text)
      .click()
      .should('have.attr', 'aria-pressed', 'true');
    this.targetInput()
      .invoke('attr', 'id')
      .then((id) => this.body().find(`label[for="${id}"]`).should('have.text', `Roll ${text}`));
  },

  /**
   * Type like a user (select-all + type), then blur so the game commits the value.
   * Native blur() is used because cy.blur() cannot see focus inside a cross-origin iframe.
   */
  typeNumber(input: Cypress.Chainable<JQuery<any>>, value: string) {
    input
      .focus()
      .type(`{selectall}${value}`, { delay: 0 })
      .then(($el) => $el[0].blur());
  },

  setTarget(value: string) {
    this.typeNumber(this.targetInput(), value);
  },
  setMultiplier(value: string) {
    this.typeNumber(this.multiplierInput(), value);
  },
  setWinChance(value: string) {
    this.typeNumber(this.winChanceInput(), value);
  },
  setBet(value: string) {
    this.typeNumber(this.betInput(), value);
  },

  /**
   * Place one bet and wait for it to settle: a new history entry appears and Bet is re-enabled.
   * No fixed sleeps — the wait ends as soon as the game reports the round is over.
   */
  placeBet() {
    this.historyCount().then((before) => {
      this.betButton().should('not.be.disabled').click();
      this.body().find('.result-item', { timeout: 20000 }).should('have.length', before + 1);
      this.betButton().should('not.be.disabled');
    });
  },
};
