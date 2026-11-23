import { LauncherPage, SeedKey } from './pages/LauncherPage';
import { DicePage } from './pages/DicePage';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Visit the launcher as a brand-new player, pick a seed, press Play, and wait for the game. */
      openGame(seed: SeedKey): Chainable<void>;
    }
  }
}

Cypress.Commands.add('openGame', (seed: SeedKey) => {
  LauncherPage.visit();
  LauncherPage.pickGame();
  LauncherPage.chooseSeed(seed);
  LauncherPage.play();
  DicePage.waitUntilReady();
});

export {};
