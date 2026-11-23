import seeds from '../fixtures/seeds.json';
import { DicePage as dice } from '../support/pages/DicePage';
import { knownBug } from '../support/knownBug';
import {
  balanceDelta,
  formatMoney,
  money,
  multiplier,
  parseMoney,
  payout,
  toHundredths,
} from '../support/oracle/diceMath';

/**
 * Part 1.3 - Area of my choice: bet amount and balance integrity.
 *
 * Why this area: in a real-money game the most expensive failures are wallet failures - debiting or
 * crediting the wrong amount, accepting a stake the player cannot cover, or placing a bet the player
 * did not intend. Results and odds (specs 01/02) prove the maths; this spec proves the money.
 *
 * Seed A is used throughout because its rolls are known: 98.29, 98.51, 12.59, 4.90.
 */

const START = money(seeds.startingBalance);
const OVER_98 = multiplier('over', toHundredths('98.00')); // x49.504

function expectBalance(ticks: number) {
  dice.balance().should(($b) => {
    expect(formatMoney(parseMoney($b.text())), 'balance').to.eq(formatMoney(ticks));
  });
}

function expectBet(value: string) {
  dice.betInput().should('have.value', value);
}

describe('Bet amount and balance integrity', () => {
  beforeEach(() => {
    cy.openGame('A');
  });

  context('bet amount controls', () => {
    it('1/2 halves, 2x doubles and the chip buttons add to the bet', () => {
      expectBet('15.0000');
      dice.betControlButton('1/2').click();
      expectBet('7.5000');
      dice.betControlButton('2x').click();
      expectBet('15.0000');
      dice.betControlButton('10').click();
      expectBet('25.0000');
      dice.betControlButton('100').click();
      expectBet('125.0000');
      dice.betControlButton('0.1').click();
      expectBet('125.1000');
      dice.betControlButton('0.01').click();
      expectBet('125.1100');
      dice.betControlButton('1').click();
      expectBet('126.1100');
    });

    it('caps the bet at the balance when typed or doubled past it', () => {
      dice.setBet('5000');
      expectBet('3000.0000');
      dice.setBet('100000000');
      expectBet('3000.0000');
      dice.setBet('3000.01');
      expectBet('3000.0000');

      dice.setBet('1000');
      dice.betControlButton('2x').click();
      expectBet('2000.0000');
      dice.betControlButton('2x').click();
      expectBet('3000.0000');
      expectBalance(START);
    });

    it('raises zero, negative and sub-minimum bets to the 0.01 minimum', () => {
      for (const typed of ['0', '-5', '0.001']) {
        dice.setBet(typed);
        expectBet('0.0100');
      }
      expectBalance(START);
    });

    it('accepts a bet with up to 4 decimals exactly as typed', () => {
      dice.setBet('12.3456');
      expectBet('12.3456');
      dice.setBet('1.5');
      expectBet('1.5000');
    });

    knownBug('BUG-006')('does not silently replace a 5-decimal bet with the 0.01 minimum', () => {
      dice.setBet('1.23456');
      dice.betInput().should(($i) => {
        expect(String($i.val()), 'bet after typing 1.23456').to.match(/^1\.234[56]$/);
      });
    });
  });

  context('settlement', () => {
    it('debits and credits small decimal bets exactly to 4 dp', () => {
      dice.setDirection('over');
      dice.setTarget('98.00');
      let balance = START;

      // Roll 1 = 98.29 (win): 0.1 x 49.504 = 4.9504 paid
      dice.setBet('0.1');
      dice.placeBet();
      balance += balanceDelta(money('0.1'), true, OVER_98);
      expectBalance(balance);
      cy.wrap(formatMoney(balance)).should('eq', '3,004.8504');

      // Roll 2 = 98.51 (win): 2.5 x 49.504 = 123.76 paid
      dice.setBet('2.5');
      dice.placeBet();
      balance += balanceDelta(money('2.5'), true, OVER_98);
      expectBalance(balance);
      cy.wrap(formatMoney(balance)).should('eq', '3,126.1104');

      // Roll 3 = 12.59 (loss): exactly 1.2345 debited
      dice.setBet('1.2345');
      dice.placeBet();
      balance += balanceDelta(money('1.2345'), false, OVER_98);
      expectBalance(balance);
      cy.wrap(formatMoney(balance)).should('eq', '3,124.8759');
    });

    it('a fast double-click on Bet (two clicks 50 ms apart) places exactly one bet', () => {
      dice.setDirection('over');
      dice.setTarget('98.00');
      // cy.dblclick() fires both clicks in one JS tick, which no real mouse can do (see BUGS.md, note N-1).
      // Two native clicks in separate tasks, 50 ms apart, model a fast human double-click.
      dice.betButton().then(($b) => {
        const button = $b[0] as HTMLButtonElement;
        button.click();
        return new Cypress.Promise<void>((resolve) =>
          setTimeout(() => {
            button.click();
            resolve();
          }, 50),
        );
      });
      dice.history().should('have.length.at.least', 1);
      dice.betButton().should('not.be.disabled');

      // Deterministic check without sleeping: the next deliberate bet must get roll 2.
      // If the double-click had placed two bets, this one would get roll 3 (12.59).
      dice.placeBet();
      dice.rollValue().should('have.text', '98.51');
      dice.history().should('have.length', 2);
      expectBalance(START + 2 * balanceDelta(money('15'), true, OVER_98));
    });

    it('blocks a bet larger than the balance, then allows it once the bet fits', () => {
      dice.setDirection('under');
      dice.setTarget('50.00');

      // Roll 1 = 98.29 loses Under 50: 3000 - 2000 = 1000 left, bet still 2000.
      dice.setBet('2000');
      dice.betButton().click();
      dice.history().should('have.length', 1);
      expectBalance(money('1000'));
      expectBet('2000.0000');
      dice.betButton().should('be.disabled');
      dice.hint().should('have.text', 'Bet exceeds your balance');

      dice.setBet('1500');
      expectBet('1000.0000');
      dice.betButton().should('not.be.disabled');
      expectBalance(money('1000'));
    });

    it('goes to exactly zero on an all-in loss and then refuses further bets', () => {
      dice.setDirection('under');
      dice.setTarget('50.00');
      dice.setBet('3000');
      dice.betButton().click();
      dice.history().should('have.length', 1);
      expectBalance(0);
      dice.betButton().should('be.disabled');
      dice.hint().should('have.text', 'Insufficient balance');
    });
  });

  context('displayed profit', () => {
    knownBug('BUG-002')('"Profits on Win" shows profit (payout - bet), not the payout', () => {
      dice.setDirection('over');
      dice.setTarget('98.00');
      expectBet('15.0000');
      const profit = payout(money('15'), OVER_98) - money('15');
      dice.profitOnWinAmount().should('eq', formatMoney(profit)); // 727.5600
    });
  });
});
