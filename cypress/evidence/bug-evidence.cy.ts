import { DicePage as dice } from '../support/pages/DicePage';
import { evidence, realClick, realSpace } from '../support/annotate';

/**
 * Not a regression test. Reproduces each bug in BUGS.md and saves an annotated screenshot to docs/screenshots/.
 * Run with `npm run screenshots:bugs`. Every test asserts the buggy state before the screenshot, so evidence is
 * only produced when the bug really reproduces (and this spec starts failing once a bug is fixed).
 */

const GAME_IFRAME = '[role="dialog"][aria-label="Joy Dice"] iframe';

function openProvablyFair(tab: 'Seeds' | 'Bet History') {
  dice.byTestId('footer-provably-fair-btn').click();
  dice.body().find('[role="dialog"]').last().contains('button', tab).click();
}

/** Reload only the game iframe (same session) and wait until the *new* document is ready. */
function reloadGameFrame() {
  cy.get(GAME_IFRAME).then(($f) => {
    const frame = $f[0] as HTMLIFrameElement;
    const oldDoc = frame.contentDocument;
    frame.contentWindow!.location.reload();
    cy.get(GAME_IFRAME, { timeout: 30000 }).should(($g) => {
      const doc = ($g[0] as HTMLIFrameElement).contentDocument;
      expect(doc, 'reloaded game document').to.not.equal(oldDoc);
      expect(doc?.readyState).to.eq('complete');
      expect(doc?.querySelector('[data-test-id="footer-balance"]'), 'balance rendered').to.not.equal(null);
    });
  });
  dice.waitUntilReady();
}

/** Seed B, Roll Over 40.00, one bet of 15: roll 1 is 50.00 (a win) and the round freezes. */
function freezeSeedBRound() {
  cy.openGame('B');
  dice.setTarget('40.00');
  dice.betButton().click();
  dice.rollValue().should('have.text', '50.00');
  dice.hint().should('contain.text', 'Nice win');
}

// The headless window is 1280x720; matching it means the app isn't rescaled during capture.
describe('Bug evidence screenshots', { viewportWidth: 1280, viewportHeight: 720 }, () => {
  it.skip('BUG-001a [historical - fixed ~2026-11-24 00:50; screenshot kept]: Seed B roll 50.00 - win shown but not credited, game locked', () => {
    freezeSeedBRound();
    cy.wait(5000); // deliberately give the round time to settle - it never does
    dice.balance().should('contain.text', '2,985.0000');
    dice.history().should('have.length', 0);
    dice.betButton().should('be.disabled');

    evidence('BUG-001a-frozen-round', 'BUG-001 — Seed B rolls 50.00: the win is shown but never credited, and the game locks', [
      { target: dice.byTestId('dice-board').find('img[alt="Dice"]'), label: 'Roll is 50.00 (in the page state; the dice never displays it).\n50.00 > target 40.00 → WIN', placement: 'right' },
      { target: dice.hint(), label: 'Says "Nice win!"', placement: 'right' },
      { target: dice.balance(), label: 'Balance 2,985.0000 — only the stake was taken.\nExpected 3,000 − 15 + 15 × 1.6501 = 3,009.7515', placement: 'above' },
      { target: dice.byTestId('dice-board').contains('Previous Results').parent(), label: 'Round never recorded in Previous Results', placement: 'above' },
      { target: dice.betButton(), label: 'Bet and every control stay disabled (waited 5 s+)', placement: 'above' },
    ]);
  });

  it.skip('BUG-001b [historical - fixed ~2026-11-24 00:50; screenshot kept]: the server DID settle and pay the frozen round', () => {
    freezeSeedBRound();
    cy.wait(3000);
    dice.balance().should('contain.text', '2,985.0000');
    openProvablyFair('Bet History');
    dice.body().find('[role="dialog"]').last().contains('24.7515').should('be.visible');

    evidence('BUG-001b-server-paid', 'BUG-001 — Bet History: the server settled the frozen round and paid 24.7515', [
      { target: dice.body().find('[role="dialog"]').last().contains('24.7515').parent(), label: 'Server record: bet 15 → cash out 24.7515 (1.65x).\nThe win WAS paid on the server', placement: 'below' },
      { target: dice.balance(), label: 'Client still shows 2,985.0000', placement: 'above' },
    ]);
  });

  it.skip('BUG-001c [historical - fixed ~2026-11-24 00:50; screenshot kept]: reloading only the game iframe shows the real balance', () => {
    freezeSeedBRound();
    cy.wait(3000);
    dice.balance().should('contain.text', '2,985.0000');
    reloadGameFrame();
    dice.balance().should('contain.text', '3,009.7515');

    evidence('BUG-001c-reload-recovers', 'BUG-001 — After reloading only the game iframe (same session) the correct balance appears', [
      { target: dice.balance(), label: '3,009.7515 = 3,000 − 15 + 24.7515.\nThe server balance was right all along — the client failed to apply it', placement: 'above' },
      { target: dice.betButton(), label: 'Game unlocked again', placement: 'above' },
    ]);
  });

  it.skip('BUG-001d [historical - fixed ~2026-11-24 00:50; screenshot kept]: in Auto mode the server keeps betting while the screen is frozen', () => {
    cy.openGame('B');
    dice.byTestId('dice-game-mode-toggle').contains('button', 'Auto').click();
    dice.setTarget('98.00');
    dice.typeNumber(dice.byTestId('dice-autobet-number-of-bets').find('input'), '6');
    dice.byTestId('dice-autobet-on-loss-increase').click();
    dice.typeNumber(dice.byTestId('dice-autobet-on-loss-increase').find('input'), '100');
    dice.byTestId('dice-autobet-button').click();
    dice.hint().should('contain.text', '1 / 6 Auto Play');
    dice.betInput().should('have.value', '30.0000');
    cy.wait(6000);
    dice.hint().should('contain.text', '1 / 6 Auto Play');
    dice.balance().should('contain.text', '3,000.0000');
    dice.history().should('have.length', 0);

    evidence('BUG-001d-auto-frozen', 'BUG-001 in Auto mode — frozen at 1 / 6, the screen shows no change while bets are placed', [
      { target: dice.hint(), label: 'Stuck at "1 / 6 Auto Play"', placement: 'right' },
      { target: dice.betInput(), label: 'Bet already doubled to 30 (On Loss +100%)', placement: 'right' },
      { target: dice.balance(), label: 'Still shows 3,000.0000', placement: 'right' },
      { target: dice.byTestId('dice-board').contains('Previous Results').parent(), label: 'No rounds shown', placement: 'above' },
    ]);

    openProvablyFair('Bet History');
    dice.body().find('[role="dialog"]').last().should('contain.text', '30.0000').and('contain.text', '15.0000');
    evidence('BUG-001e-auto-server-bets', 'BUG-001 in Auto mode — Bet History: the server took two bets (−45) that the screen never showed', [
      { target: dice.body().find('[role="dialog"]').last().contains('30.0000').parent(), label: 'Bet 2: 30.00 lost (roll 64.28)', placement: 'right' },
      { target: dice.body().find('[role="dialog"]').last().contains(/^\s*15\.0000\s*$/).parent(), label: 'Bet 1: 15.00 lost (roll 50.00)', placement: 'right' },
      { target: dice.balance(), label: 'Screen: 3,000.0000. Real balance: 2,955.0000 (shown after reload)', placement: 'above' },
    ]);
  });

  it('BUG-002: "Profits on Win" shows the payout, not the profit', () => {
    cy.openGame('A');
    dice.setDirection('over');
    dice.setTarget('98.00');
    dice.profitOnWinAmount().should('eq', '742.5600');

    evidence('BUG-002-profit-on-win', 'BUG-002 — "Profits on Win" shows the payout (bet × multiplier), not the profit', [
      { target: dice.betInput(), label: 'Bet 15.0000', placement: 'right' },
      { target: dice.multiplierInput(), label: 'Multiplier ×49.504', placement: 'above' },
      { target: dice.profitOnWinBlock(), label: 'Shows 742.5600 = 15 × 49.504 (payout).\nProfit is 742.56 − 15 = 727.5600 — overstated by the stake', placement: 'below' },
    ]);
  });

  it('BUG-003: a typed target is stored 0.01 lower', () => {
    cy.openGame('A');
    dice.setDirection('over');
    dice.setTarget('16.49');
    dice.targetInput().should('have.value', '16.48');

    evidence('BUG-003-target-floored', 'BUG-003 — Typed target 16.49 is stored as 16.48 (float floor: 16.49 × 100 = 1648.999…)', [
      { target: dice.targetInput(), label: 'Typed 16.49 → became 16.48', placement: 'below' },
      { target: dice.multiplierInput(), label: '×1.1854 — for 16.49 it should be ×1.1856', placement: 'above' },
      { target: dice.winChanceInput(), label: 'Win chance is for 16.48, not 16.49', placement: 'above' },
    ]);
  });

  it('BUG-004: multiplier below the rule at Under 4.38', () => {
    cy.openGame('A');
    dice.setDirection('under');
    dice.setTarget('4.38');
    dice.targetInput().should('have.value', '4.38');
    dice.multiplierInput().should('have.value', '22.604');

    evidence('BUG-004-multiplier-low', 'BUG-004 — Multiplier is cut too low: Under 4.38 shows ×22.604, the rule gives ×22.605', [
      { target: dice.targetInput(), label: 'Roll Under 4.38 → 438 of 10,001 rolls win', placement: 'below' },
      { target: dice.multiplierInput(), label: 'Shows ×22.604.\n0.99 × 10,001 ÷ 438 = 22.605 exactly → should be ×22.605', placement: 'above' },
    ]);
  });

  it('BUG-005: win chance shows the nominal range, not the real chance', () => {
    cy.openGame('A');
    dice.setDirection('over');
    dice.setTarget('2.00');
    dice.winChanceInput().should('have.value', '98.00');
    dice.multiplierInput().should('have.value', '1.0103');

    evidence('BUG-005-win-chance', 'BUG-005 — Win chance shows 100 − target, not the real chance out of 10,001 rolls', [
      { target: dice.targetInput(), label: 'Roll Over 2.00 → 9,800 winning rolls', placement: 'below' },
      { target: dice.winChanceInput(), label: 'Shows 98.00%.\nReal: 9,800 ÷ 10,001 = 97.99%', placement: 'above' },
      { target: dice.multiplierInput(), label: '×1.0103 is computed from 97.99%\n— the two fields disagree', placement: 'above' },
    ]);
  });

  it('BUG-006: a 5-decimal bet silently becomes 0.01', () => {
    cy.openGame('A');
    dice.setBet('1.23456');
    dice.betInput().should('have.value', '0.0100');

    evidence('BUG-006-bet-reset', 'BUG-006 — A bet typed with 5 decimals is silently replaced by the 0.01 minimum', [
      { target: dice.betInput(), label: 'Typed 1.23456 → silently became 0.0100.\nNo message; expected 1.2345 / 1.2346 or a validation error', placement: 'right' },
    ]);
  });

  it('BUG-007: a bet over the $1,000,000 max win is silently ignored', () => {
    cy.openGame('A');
    dice.setDirection('over');
    dice.setTarget('98.00');
    dice.setBet('3000');
    dice.placeBet(); // roll 1 = 98.29 wins: 3,000 x 49.504 = 148,512
    dice.balance().should('contain.text', '148,512.0000');
    dice.setTarget('98.50');
    dice.setBet('15151');
    dice.betInput().should('have.value', '15151.0000');
    dice.profitOnWinAmount().should('eq', '1,000,056.9060');
    dice.betButton().click();
    cy.wait(4000); // give the ignored click every chance to do something
    dice.history().should('have.length', 1);
    dice.balance().should('contain.text', '148,512.0000');
    dice.betButton().should('not.be.disabled');

    evidence('BUG-007-max-win-silent', 'BUG-007 — Payout over the $1,000,000 max win: clicking Bet does nothing, with no message', [
      { target: dice.profitOnWinBlock(), label: 'Payout 15,151 × 66.006 = 1,000,056.91\n> $1,000,000 max win (Game Information)', placement: 'right' },
      { target: dice.betButton(), label: 'Clicked BET → no roll, no error; still looks enabled', placement: 'right' },
      { target: dice.hint(), label: "Still the previous round's message", placement: 'right' },
      { target: dice.balance(), label: 'Balance unchanged 148,512.0000', placement: 'above' },
    ]);
  });

  it('BUG-008: with hotkeys enabled, two Space taps place two bets', () => {
    cy.openGame('A');
    // Hotkeys are off by default; the first click on the Hotkeys button turns them on (remembered in localStorage).
    dice.byTestId('footer-hotkeys-btn').click();
    // The game puts a non-breaking space in "Hotkeys Enabled", hence \s rather than a literal space.
    dice.body().should(($b) => expect($b.text()).to.match(/Hotkeys\s+Enabled/));
    // A real click on a non-input area moves real keyboard focus into the game frame (and places no bet).
    dice.byTestId('dice-board').find('strong').first().then(realClick);
    realSpace();
    cy.wait(120);
    realSpace();
    dice.history().should('have.length', 2);
    dice.balance().should('contain.text', '3,030.0060');

    evidence('BUG-008-space-double-bet', 'BUG-008 — With hotkeys on, two Space taps 120 ms apart place TWO bets (two clicks place one)', [
      { target: dice.body().contains(/Hotkeys\s+Enabled/), label: 'Hotkeys turned on (off by default)', placement: 'above' },
      { target: dice.history(), label: '2 bets from one double-tap of Space', placement: 'above' },
      { target: dice.balance(), label: '3,000 + 2 × 15.003 = 3,030.0060 → both bets placed', placement: 'right' },
      { target: dice.betButton(), label: 'The Bet button ignores clicks while a round runs;\nthe Space hotkey does not', placement: 'right' },
    ]);
  });
});
