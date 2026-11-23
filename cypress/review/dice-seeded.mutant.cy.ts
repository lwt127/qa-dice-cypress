// REVIEW EVIDENCE ONLY - not part of the suite. The teammate's dice-seeded.cy.ts with one change (setTarget('99.99'),
// so bets 1 and 2 LOSE) plus a check proving all four bets lost. It still passes 6/6 + the check: see REVIEW.md #1.
/**
 * Dice: seeded results and payout maths.
 *
 * Runs against the QA assessment launcher. The game is in a cross-origin
 * iframe, so cypress.config.ts sets `chromeWebSecurity: false`.
 */

const LAUNCHER_URL = 'https://qa-assessment-dice.play.purejoy.games/';
const BET = 15;

const game = () =>
  cy.get('iframe').its('0.contentDocument.body').then(cy.wrap);

const openGame = (seed: string) => {
  cy.visit(LAUNCHER_URL);
  cy.contains('Joy Dice').click();
  cy.contains(seed).click();
  cy.contains('button', /^\s*Play\s*$/).click();
  cy.wait(3000);
};

const setTarget = (value: string) => {
  game().find('[data-test-id="dice-slider-input"] input').clear().type(`${value}{enter}`);
};

const readBalance = () =>
  game()
    .find('[data-test-id="footer-balance"]')
    .invoke('text')
    .then((text) => Number(text.replace(/,/g, '')));

const bet = () => {
  game().find('[data-test-id="dice-bet-button"]').click();
  cy.wait(3000);
};

const isWin = (roll: number, target: number) => roll >= target;

describe('Dice: Seed A, Roll Over 98.00', { testIsolation: false }, () => {
  before(() => {
    openGame('Seed A');
    setTarget('99.99'); // MUTANT: rolls 98.29 and 98.51 now LOSE
  });

  it('wins the first bet', () => {
    readBalance().then((before) => {
      bet();
      game().find('[data-test-id="dice-result"]').should('contain', '98');
      readBalance().should('not.eq', before);
    });
  });

  it('wins the second bet', () => {
    readBalance().then((before) => {
      bet();
      game().find('[data-test-id="dice-result"]').should('contain', '98');
      readBalance().should('not.eq', before);
    });
  });

  it('loses the third bet', () => {
    readBalance().then((before) => {
      bet();
      readBalance().should('eq', before - BET);
    });
  });

  it('loses the fourth bet', () => {
    readBalance().then((before) => {
      bet();
      readBalance().should('eq', before - BET);
    });
  });

  it('MUTANT CHECK: all four bets really lost (3000 - 4 x 15)', () => {
    game().find('[data-test-id="dice-slider-input"] input').should('have.value', '99.99');
    readBalance().should('eq', 2940);
  });
});

describe('Dice: payout maths', () => {
  it('pays out more than the stake on a win', () => {
    const roll = 98.29;
    const target = 98;
    expect(isWin(roll, target)).to.equal(true);
  });

  it('shows the fair multiplier for the win chance', () => {
    openGame('Seed A');
    setTarget('50');
    game()
      .find('[data-test-id="dice-board"] input[type="number"]')
      .last()
      .invoke('val')
      .then((chance) => {
        game()
          .find('[data-test-id="dice-multiplier-input"] input')
          .invoke('val')
          .then((multiplier) => {
            expect(Number(multiplier)).to.be.closeTo(100 / Number(chance), 0.05);
          });
      });
  });
});
