import seeds from '../fixtures/seeds.json';
import { DicePage as dice } from '../support/pages/DicePage';
import {
  Direction,
  balanceDelta,
  formatDecimal,
  formatMoney,
  isWin,
  money,
  multiplier,
  normaliseNumber,
  parseMoney,
  toHundredths,
} from '../support/oracle/diceMath';

/**
 * Part 1.1 - Results are correct.
 * Each test is a fresh player (new visit), so the seeded rolls start from roll 1 and balance from 3,000.
 * Expected win/loss and balance come from the oracle; final balances are also pinned as literals,
 * calculated by hand, so an oracle mistake cannot make both sides agree by accident.
 */

const START = money(seeds.startingBalance);
const BET = money(seeds.defaultBet);

function expectBalance(ticks: number) {
  dice.balance().should(($b) => {
    expect(formatMoney(parseMoney($b.text())), 'balance').to.eq(formatMoney(ticks));
  });
}

function configure(dir: Direction, target: string) {
  dice.setDirection(dir);
  dice.setTarget(target);
  dice.targetInput().should('have.value', target);
  const mult = multiplier(dir, toHundredths(target));
  dice.multiplierInput().should(($i) => {
    expect(normaliseNumber(String($i.val())), 'multiplier').to.eq(formatDecimal(mult));
  });
  return mult;
}

function playSeededSequence(dir: Direction, target: string, rolls: string[]) {
  const mult = configure(dir, target);
  dice.betInput().should('have.value', seeds.defaultBet);
  expectBalance(START);

  let balance = START;
  rolls.forEach((roll, i) => {
    const won = isWin(dir, toHundredths(target), toHundredths(roll));
    balance += balanceDelta(BET, won, mult);

    dice.placeBet();
    dice.rollValue().should('have.text', roll);
    dice.history().should('have.length', i + 1).last().should('have.text', roll);
    if (won) {
      dice.history().last().should('have.class', 'result-item--win');
      dice.hint().should('contain.text', 'Nice win');
    } else {
      dice.history().last().should('not.have.class', 'result-item--win');
      dice.hint().should('not.contain.text', 'Nice win');
    }
    expectBalance(balance);
  });
  return balance;
}

describe('Seeded results: rolls, win/loss and balance', () => {
  context('Seed A (rolls 98.29, 98.51, 12.59, 4.90)', () => {
    it('Roll Over 98.00 (preset): win, win, loss, loss; balance 3000 -> 4425.12', () => {
      cy.openGame('A');
      const final = playSeededSequence('over', '98.00', seeds.seeds.A.rolls);
      cy.wrap(formatMoney(final)).should('eq', '4,425.1200');
    });

    it('Roll Under 50.00: same rolls, opposite outcomes - rolls do not depend on the target', () => {
      cy.openGame('A');
      const final = playSeededSequence('under', '50.00', seeds.seeds.A.rolls);
      cy.wrap(formatMoney(final)).should('eq', '2,999.4030');
    });

    it('a new visit is a new player: balance resets and rolls restart from the first', () => {
      cy.openGame('A');
      configure('over', '98.00');
      dice.placeBet();
      dice.rollValue().should('have.text', '98.29');
      expectBalance(money('3727.56'));

      cy.openGame('A');
      expectBalance(START);
      dice.history().should('have.length', 0);
      configure('over', '98.00');
      dice.placeBet();
      dice.rollValue().should('have.text', '98.29');
      expectBalance(money('3727.56'));
    });
  });

  context('Seed B (first roll 50.00 - the boundary)', () => {
    /**
     * Seed B rounds are asserted step by step instead of via placeBet(), so that if the round
     * never completes the failure says exactly which part of the round is wrong.
     * These caught BUG-001 (round froze on 50.00); fixed in the build deployed around 2026-11-24 00:50,
     * so they are now plain regression tests guarding against it coming back.
     */
    function betOnceAndCheck(dir: Direction, target: string, expectWin: boolean) {
      cy.openGame('B');
      const mult = configure(dir, target);
      dice.betButton().click();

      dice.rollValue().should('have.text', '50.00');
      expect(isWin(dir, toHundredths(target), toHundredths('50.00'))).to.eq(expectWin);
      expectBalance(START + balanceDelta(BET, expectWin, mult));
      if (expectWin) dice.hint().should('contain.text', 'Nice win');
      else dice.hint().should('not.contain.text', 'Nice win');

      // The round must finish: result recorded in history and the game ready for the next bet.
      dice.body().should(($b) => {
        const items = $b.find('.result-item');
        expect(items, 'round recorded in Previous Results (game must not freeze)').to.have.length(1);
        expect(items.first().text()).to.eq('50.00');
      });
      dice.betButton().should('not.be.disabled');
    }

    it('Roll Over 50.00 (preset): 50.00 is not greater than 50.00, so the bet loses', () => {
      betOnceAndCheck('over', '50.00', false);
    });

    it('Roll Under 50.00: 50.00 is not less than 50.00, so the bet loses', () => {
      betOnceAndCheck('under', '50.00', false);
    });

    it('Roll Over 40.00: 50.00 wins and pays 15 x 1.6501', () => {
      betOnceAndCheck('over', '40.00', true);
    });
  });
});
