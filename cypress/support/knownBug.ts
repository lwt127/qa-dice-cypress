/**
 * Wraps `it` for tests that assert correct behaviour the game currently violates (see BUGS.md).
 *
 * Default: the test runs and fails, so the defect stays visible.
 * With `--env skipKnownBugs=true`, the test is skipped and its title is kept in the report, so a
 * regression gate can stay green while a known defect is open.
 */
export function knownBug(bugId: string) {
  const skip = Cypress.env('skipKnownBugs') === true || Cypress.env('skipKnownBugs') === 'true';
  return (title: string, fn: () => void) =>
    skip ? it.skip(`${title} [${bugId} - skipped]`, fn) : it(`${title} [${bugId}]`, fn);
}
