import { DicePage as dice } from '../support/pages/DicePage';
import { knownBug } from '../support/knownBug';
import {
  Direction,
  formatDecimal,
  multiplier,
  normaliseNumber,
  toHundredths,
  winChanceExact,
  winChancePercent,
} from '../support/oracle/diceMath';

/**
 * Part 1.2 - Win chance and multiplier recalculate.
 *
 * How "correct" is decided: the oracle implements the brief's rule exactly (10,001 rolls, 99% RTP,
 * multiplier = 0.99 / exact win chance cut to 5 significant digits) using integer maths.
 * - Multiplier: must match the oracle exactly; it is what the player is paid.
 * - Win chance: shown to 2 dp, so the general tests allow one display step (0.01) of difference from
 *   the exact probability. A separate strict test checks the rounding itself (see BUG-005).
 *
 * Values were chosen to cover both directions, both ends of each range, the 50/50 midpoint, the
 * default (50.50), and to move the target up and down in one session so stale recalculation would show.
 */

const SEED = 'A'; // Any seed works; no bets are placed in this spec.

function expectOdds(dir: Direction, target: string) {
  const t = toHundredths(target);
  const mult = formatDecimal(multiplier(dir, t));

  dice.targetInput().should('have.value', target);
  dice.multiplierInput().should(($i) => {
    expect(normaliseNumber(String($i.val())), `multiplier @ ${dir} ${target}`).to.eq(mult);
  });
  dice.winChanceInput().should(($i) => {
    const shown = Number($i.val());
    expect(shown, `win chance @ ${dir} ${target}`).to.be.closeTo(winChanceExact(dir, t), 0.01);
  });
  // Headline "N x on Win" and "Profits on Win (Nx)" must agree with the multiplier field.
  dice.byTestId('dice-board').find('strong').first().should(($s) => {
    expect(normaliseNumber($s.text()), 'headline multiplier').to.eq(mult);
  });
  dice.profitOnWin().should('contain.text', `(${mult}x)`);
}

describe('Win chance and multiplier recalculate', () => {
  before(() => {
    // Anchor the oracle to the worked example in the brief before trusting it for anything else.
    expect(formatDecimal(multiplier('over', toHundredths('50.00')))).to.eq('1.9801');
  });

  beforeEach(() => {
    cy.openGame(SEED);
  });

  it('defaults to Roll Over 50.50 with consistent odds', () => {
    dice.byTestId('dice-mode-toggle').contains('button', 'Over').should('have.attr', 'aria-pressed', 'true');
    expectOdds('over', '50.50');
  });

  it('Roll Over: typing the target up and down recalculates multiplier and win chance', () => {
    dice.setDirection('over');
    for (const target of ['50.00', '75.00', '98.00', '99.99', '60.00', '25.00', '10.50', '2.00', '33.33']) {
      dice.setTarget(target);
      expectOdds('over', target);
    }
  });

  it('Roll Under: typing the target down and up recalculates multiplier and win chance', () => {
    dice.setDirection('under');
    for (const target of ['50.00', '25.00', '2.00', '0.01', '12.34', '49.50', '75.00', '98.00', '66.67']) {
      dice.setTarget(target);
      expectOdds('under', target);
    }
  });

  it('the target -/+ buttons step by 1.00 in both directions and recalculate', () => {
    for (const dir of ['over', 'under'] as Direction[]) {
      dice.setDirection(dir);
      dice.setTarget('50.00');
      dice.targetStepper('+').click();
      expectOdds(dir, '51.00');
      dice.targetStepper('+').click();
      expectOdds(dir, '52.00');
      dice.targetStepper('−').click();
      dice.targetStepper('−').click();
      dice.targetStepper('−').click();
      expectOdds(dir, '49.00');
    }
  });

  it('switching Over <-> Under keeps the target and flips the odds', () => {
    dice.setDirection('over');
    dice.setTarget('25.00');
    expectOdds('over', '25.00');
    dice.setDirection('under');
    expectOdds('under', '25.00');
    dice.setDirection('over');
    expectOdds('over', '25.00');
  });

  it('editing the win chance back-solves the target and multiplier', () => {
    dice.setDirection('over');
    dice.setWinChance('25');
    expectOdds('over', '75.00');

    dice.setDirection('under');
    dice.setWinChance('25');
    expectOdds('under', '25.00');
  });

  it('editing the multiplier back-solves the target and win chance', () => {
    dice.setDirection('under');
    dice.setMultiplier('2');
    // Under 49.50 -> 4,950 winning rolls -> 0.99 / (4950/10001) = 2.00020 -> x2.0002
    expectOdds('under', '49.50');
  });

  it('clamps the target to the allowed range for each direction', () => {
    dice.setDirection('over');
    dice.setTarget('1.00');
    expectOdds('over', '2.00');
    dice.setTarget('100');
    expectOdds('over', '99.99');

    dice.setDirection('under');
    dice.setTarget('99.99');
    expectOdds('under', '98.00');
    dice.setTarget('0');
    expectOdds('under', '0.01');
  });

  context('known defects (see BUGS.md)', () => {
    knownBug('BUG-003')('keeps a typed target exactly as entered, e.g. Over 16.49 and Under 1.16', () => {
      dice.setDirection('over');
      dice.setTarget('16.49');
      expectOdds('over', '16.49');

      dice.setDirection('under');
      dice.setTarget('1.16');
      expectOdds('under', '1.16');
    });

    knownBug('BUG-004')('cuts the multiplier from the exact value: Under 4.38 is exactly x22.605', () => {
      dice.setDirection('under');
      dice.setTarget('4.38');
      // 0.99 x 10001 / 438 = 22.605 exactly, so the 5-significant-digit cut is 22.605.
      expectOdds('under', '4.38');
    });

    knownBug('BUG-005')('shows the exact win chance rounded to 2 dp: Over 2.00 is 9,800/10,001 = 97.99%', () => {
      dice.setDirection('over');
      dice.setTarget('2.00');
      dice.winChanceInput().should('have.value', winChancePercent('over', toHundredths('2.00')));
    });
  });
});
