import seeds from '../../fixtures/seeds.json';

export type SeedKey = keyof typeof seeds.seeds;

/** The casino-style launcher page that hosts the game iframe. */
export const LauncherPage = {
  visit() {
    cy.visit('/');
    cy.contains('h1', 'Dice · QA assessment').should('be.visible');
  },

  pickGame() {
    cy.get('button[aria-label^="Play Joy Dice"]').click();
    cy.get('dialog.seed-dialog').should('be.visible');
  },

  chooseSeed(seed: SeedKey) {
    const { value, label, presetTarget } = seeds.seeds[seed];
    cy.get('dialog.seed-dialog').within(() => {
      cy.get(`input[type="radio"][value="${value}"]`).check();
      cy.get('.seed-dialog__chosen').should('contain.text', presetTarget);
      cy.contains('.row__code', label).should('exist');
    });
  },

  play() {
    cy.get('dialog.seed-dialog').contains('button[type="submit"]', /^\s*Play\s*$/).click();
    cy.get('[role="dialog"][aria-label="Joy Dice"] iframe').should('exist');
  },
};
