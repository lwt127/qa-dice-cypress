import './commands';

beforeEach(() => {
  // Third-party telemetry is not under test and is rate-limited (429s seen during exploration).
  // Stubbing it removes network noise without touching any game or wallet traffic.
  cy.intercept({ hostname: /non-prod-watson\./ }, { statusCode: 204 });
  cy.intercept({ hostname: /ingest\.(de\.)?sentry\.io$/ }, { statusCode: 204 });
  cy.intercept({ hostname: 'static.cloudflareinsights.com' }, { statusCode: 204 });
});
