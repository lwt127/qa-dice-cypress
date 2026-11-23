import seeds from '../fixtures/seeds.json';
import { DicePage as dice } from '../support/pages/DicePage';
import { evidence } from '../support/annotate';
import { Direction, balanceDelta, formatMoney, isWin, money, multiplier, parseMoney, toHundredths } from '../support/oracle/diceMath';

/**
 * BUG-001 retest (2026-11-24): Seed B's roll 1 (50.00) at the three targets from the bug report.
 * Asserts the CORRECT behaviour and screenshots the settled round as evidence of the fix.
 * Run headed to watch it: npx cypress run --headed --config specPattern=cypress/evidence/**\/*.cy.ts --spec cypress/evidence/bug-evidence-retest.cy.ts
 */
const START = money(seeds.startingBalance);
const BET = money(seeds.defaultBet);

const cases: { dir: Direction; target: string; name: string }[] = [
  { dir: 'over', target: '50.00', name: 'over-50' },
  { dir: 'under', target: '50.00', name: 'under-50' },
  { dir: 'over', target: '40.00', name: 'over-40' },
];

describe('BUG-001 retest: Seed B roll 50.00 settles', { viewportWidth: 1280, viewportHeight: 720 }, () => {
  cases.forEach(({ dir, target, name }) => {
    const won = isWin(dir, toHundredths(target), toHundredths('50.00'));
    const expected = START + balanceDelta(BET, won, multiplier(dir, toHundredths(target)));

    it(`Roll ${dir} ${target}: 50.00 ${won ? 'wins' : 'loses'}, balance ${formatMoney(expected)}, game unlocked`, () => {
      cy.openGame('B');
      dice.setDirection(dir);
      dice.setTarget(target);
      dice.placeBet(); // waits for the round to appear in Previous Results and Bet to re-enable
      dice.rollValue().should('have.text', '50.00');
      dice.history().should('have.length', 1).first().should(won ? 'have.class' : 'not.have.class', 'result-item--win');
      dice.balance().should(($b) => expect(formatMoney(parseMoney($b.text()))).to.eq(formatMoney(expected)));

      evidence(`BUG-001-retest-${name}`, `BUG-001 retest ${new Date().toISOString().slice(0, 16)}Z — Seed B, Roll ${dir === 'over' ? 'Over' : 'Under'} ${target}: round settles correctly`, [
        { target: dice.history(), label: `50.00 recorded as a ${won ? 'WIN' : 'LOSS'}`, placement: 'above' },
        { target: dice.balance(), label: `${formatMoney(expected)} = 3,000 ${won ? '− 15 + 24.7515' : '− 15'} ✓`, placement: 'right' },
        { target: dice.betButton(), label: 'Bet enabled again — game not locked ✓', placement: 'right' },
      ]);
    });
  });
});
