import { defineConfig } from 'cypress';
import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_DIR = path.join(__dirname, 'docs', 'screenshots');

export default defineConfig({
  // One mochawesome JSON per spec; scripts/run-3x.js merges them into an HTML report per run.
  reporter: 'mochawesome',
  reporterOptions: {
    reportDir: process.env.REPORT_DIR || 'cypress/results',
    overwrite: false,
    html: false,
    json: true,
  },
  e2e: {
    setupNodeEvents(on) {
      // Screenshots from the bug-evidence spec go to docs/screenshots/<name>.png so BUGS.md can embed them.
      on('after:screenshot', (details) => {
        if (!details.specName.includes('bug-evidence') || details.testFailure) return {};
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        const target = path.join(EVIDENCE_DIR, `${details.name}.png`);
        fs.copyFileSync(details.path, target);
        fs.rmSync(details.path);
        return { path: target };
      });
    },
    baseUrl: 'https://qa-assessment-dice.play.purejoy.games',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    // The game iframe is served from a different origin (dev-games.cbet.cf.cvl.joystudios.xyz).
    // Disabling web security lets Cypress reach into it; this only works in Chromium-family browsers.
    chromeWebSecurity: false,
    viewportWidth: 1280,
    viewportHeight: 900,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
    // Retries are deliberately off: a flaky test should fail visibly, not be retried into green.
    retries: { runMode: 0, openMode: 0 },
    video: false,
    screenshotOnRunFailure: true,
  },
});
