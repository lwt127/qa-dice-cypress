# Review: `dice-seeded.cy.ts`

**Verdict: Request changes.** I'm not approving this one yet.

Thanks for putting this together. It's small and easy to read, it uses the game's `data-test-id` hooks, the comment about `chromeWebSecurity` is spot on, and the loss tests check the exact amount (`before - BET`). Those are the right instincts.

The problem is that the spec is green while the thing it's named after isn't being tested. I ran it, and then ran a deliberately broken version, and **it can't tell a win from a loss**. Details and evidence below, then the blocking comments and the smaller ones.

---

## What I ran

Both files are in [`cypress/review/`](cypress/review), so you can repeat this:

```bash
npx cypress run --e2e --config "specPattern=cypress/review/**/*.cy.ts" --spec cypress/review/dice-seeded.cy.ts
npx cypress run --e2e --config "specPattern=cypress/review/**/*.cy.ts" --spec cypress/review/dice-seeded.mutant.cy.ts
```

| Run | Result |
|---|---|
| Spec as written, run 1 | ❌ **Failed in the `before` hook.** `cy.find()` failed because the page updated; the subject is no longer attached to the DOM (from `.clear().type()` in `setTarget`). The 4 Seed A tests were skipped. |
| Spec as written, runs 2 and 3 | ✅ 6/6 pass |
| **Mutant**: line 42 changed to `setTarget('99.99')`, so rolls 98.29 and 98.51 **lose** | ✅ **6/6 pass**, plus an extra check I added: target is `99.99` and the final balance is `2,940` (all 4 bets lost) |

My runs used this repo's config, which has a 15 s command timeout and stubs telemetry. That's *more* forgiving than Cypress's 4 s default, so I'd expect the flake to show up more often in your setup, not less.

The mutant result is the key one. "wins the first bet" and "wins the second bet" pass when both bets lose.

---

## Blocking

### 1. The "wins" tests don't check for a win (lines 48–49, 56–57)

```ts
game().find('[data-test-id="dice-result"]').should('contain', '98');
readBalance().should('not.eq', before);
```

- `not.eq before` passes on a **loss** too, because the balance drops by 15. It only fails if nothing happens at all.
- `contain '98'` passes for 98.29, but also for 98.51, 12.98, 98.00 or anything else with "98" in it. And it's the same check for bet 1 and bet 2, so it can't tell them apart.
- So the payout, which is the thing a player cares about, is never checked. A game that paid ×2 instead of ×49.504 would pass.

**Suggestion:** assert the exact roll and the exact balance. Seed A at Over 98.00 is fully determined:

| Bet | Roll | Outcome | Balance |
|---|---|---|---|
| 1 | 98.29 | win | 3,727.5600 |
| 2 | 98.51 | win | 4,455.1200 |
| 3 | 12.59 | loss | 4,440.1200 |
| 4 | 4.90 | loss | 4,425.1200 |

The win amount is 15 × 49.504 − 15 = +727.56. Use `have.text` / `eq` on the roll value and the formatted balance, rather than `contain` / `not.eq`.

### 2. `isWin` uses `>=`, but Roll Over wins only when the roll is *greater* (line 37)

```ts
const isWin = (roll: number, target: number) => roll >= target;
```

The brief says: *"Roll Over wins when the roll is greater than the target."* With `>=`, a roll equal to the target counts as a win. That's exactly the case Seed B exists to test (its first roll is 50.00 against a target of 50.00). If anyone reuses this helper for Seed B, it encodes the wrong rule.

Also, the only test that uses it (**"pays out more than the stake on a win"**, lines 77–81) doesn't touch the game. It checks the spec's own helper with constants the spec chose. It passes with the game switched off, and nothing in it relates to a payout or a stake. I'd delete it, or replace it with a real payout check (see #1).

### 3. The multiplier assertion uses the wrong formula, and its tolerance hides that (line 95)

```ts
expect(Number(multiplier)).to.be.closeTo(100 / Number(chance), 0.05);
```

- The rule is **0.99 ÷ exact win chance, cut (not rounded) to 5 significant digits**. `100 / chance` leaves out the 1% house edge.
- At target 50 the game shows ×1.9801 and `100/50 = 2`. They differ by 0.0199, which is inside 0.05, so it passes, but only because of the tolerance.
- The test can't detect the property that matters most. **A game paying 100% RTP (×2.0000) would pass.** A game that rounds instead of cutting would pass too.
- If you moved the target, the formula itself breaks. Across all Over targets it's more than 0.05 off at **1,981 of 9,997** of them.
- Both inputs come from the UI. If the win chance shown is wrong and the multiplier is wrong in the same way, the test still passes. (The game does show the wrong win chance at many targets: Over 2.00 shows 98.00%, but the real chance is 9,800/10,001 = 97.99%. See BUGS.md BUG-005.)
- The brief asks for the target to move *up and down, in both Roll Over and Roll Under*. This checks one value, in one direction.

**Suggestion:** work out the expected multiplier from the target, not from the screen. For Over *t*, winning rolls = 10,000 − 100*t*; multiplier = cut5(0.99 × 10,001 ÷ winning rolls). Compare **exactly**: there's no tolerance, because the result is defined to 5 significant figures. Use a short table of targets in both directions, including the extremes (Over 2.00 / 99.99, Under 0.01 / 98.00) and 50.00.

### 4. Fixed `cy.wait(3000)` instead of waiting for the game (lines 19, 34)

- **After Play (line 19):** the game shows a "Loading game..." overlay and keeps its inputs disabled while it loads. In my measurement it wasn't usable until about 4.7 s after the game frame started loading. Three seconds is a guess that's sometimes too short. That's very likely the `before`-hook failure above: `clear()` re-renders the input, and `type()` then acts on a detached element.
- **After Bet (line 34):** a round settles in about 1.4 s, so every bet wastes about 1.6 s. Worse, if the server is ever slower than 3 s, the balance gets read mid-round.
- `readBalance()` ends in `.then(...)`, so the `.should(...)` after it **doesn't retry**. It's a single read taken after the sleep. The test can't wait for the balance to change; it relies entirely on the 3 s.

**Suggestion:** wait for conditions, not time.
- After Play: wait for the balance to appear and for `[data-test-id="dice-loading"]` to be gone.
- After Bet: wait for the Previous Results list to grow by one and for Bet to be enabled again.
- Then assert with `should()` on a query that can retry, for example `.should(($el) => expect(parse($el.text())).to.eq(...))`.

### 5. `testIsolation: false` makes the 4 tests depend on each other (line 39)

Each `it` relies on the previous one having placed its bet. The consequences:

- If test 1 fails, tests 2–4 fail with misleading errors.
- `it.only('loses the third bet')` fails, because it places bet 1 (98.29) instead.
- Turning on retries would make things worse: a retried test places an *extra* bet and gets the next roll in the sequence.

**Suggestion:** either one `it` that plays the 4-bet sequence and asserts each step, or a fresh `openGame('Seed A')` per test. A new visit restarts the seed, so each test can play up to the bet it cares about.

### 6. Seed B isn't tested

The spec is called "seeded results", but it only covers Seed A. Seed B is the boundary case the brief calls out ("Seed B always rolls 50.00 first"). It's also where the game has its most serious bug. After the 50.00 roll the client never settles the round: a win is shown but not credited, and the game locks (BUGS.md BUG-001).

So right now this spec is all green while the seeded results have a critical bug. That's the false confidence I'd want to avoid before merging. **Suggestion:** add Seed B at Over 50.00 and Under 50.00 (both should lose; 50.00 is neither greater nor less than 50.00), and one where it should win (e.g. Over 40.00). Expect those tests to fail until BUG-001 is fixed. That's the point: they document the bug.

---

## Non-blocking

- **`setTarget` doesn't check the value was accepted (line 23).** It doesn't set the direction either; it relies on the default being Over. Assert `should('have.value', '98.00')` afterwards. It matters: some typed targets are silently stored 0.01 lower (typing 16.49 gives 16.48; BUGS.md BUG-003), so "I typed it" ≠ "the game uses it".
- **Money as JS floats (lines 30, 64, 71).** `before - BET` is exact for these particular balances, but not in general. In a 2,000-value sample of 4-decimal balances, 6 gave a float result that doesn't equal the exact difference. Compare in integer units (×10,000) or as formatted strings.
- **Brittle selectors.**
  - `cy.get('iframe')` (line 12) takes the first iframe on the page.
  - `input[type="number"]').last()` (line 88) finds the win chance by position. A new input on the board would silently change what's checked. The inputs have `<label for>` text ("Win Chance", "Multiplier", "Roll Over"), so look them up by label.
- **Loose text matches in `openGame`.** `cy.contains('Joy Dice')` and `cy.contains(seed)` (lines 16–17) click the first element containing the text. The launcher also remembers the last seed you picked. Check the selected radio (`input[value="seed-a-streak"]` should be `:checked`) before pressing Play, so a test can't quietly run with the wrong seed.
- **Test names should say what's asserted.** "wins the first bet" doesn't check a win (#1). "pays out more than the stake on a win" touches no payout (#2). "shows the fair multiplier" uses an unfair formula (#3). When names promise more than the assertions check, the report misleads whoever reads it.
- **Hard-coded `LAUNCHER_URL` (line 8).** Put it in `baseUrl` in `cypress.config.ts` and use `cy.visit('/')`, so the spec can run against another environment.

---

## Rough shape I'd suggest for the Seed A block

```ts
const SEED_A = [
  { roll: '98.29', win: true,  balance: '3,727.5600' },
  { roll: '98.51', win: true,  balance: '4,455.1200' },
  { roll: '12.59', win: false, balance: '4,440.1200' },
  { roll: '4.90',  win: false, balance: '4,425.1200' },
];

it('Seed A, Roll Over 98.00: rolls, outcomes and balance for bets 1-4', () => {
  openGame('Seed A');                       // waits for the loading overlay to go, not a fixed time
  setTarget('98.00');                       // and asserts the field shows 98.00
  SEED_A.forEach((step, i) => {
    placeBet();                             // click Bet, then wait for Previous Results to have i + 1 entries
    game().find('[data-test-id="dice-roll-value"]').should('have.text', step.roll);
    game().find('[data-test-id="footer-balance"]').should('have.text', step.balance);
    // and the win/loss state, e.g. the history entry has class result-item--win only when step.win
  });
});
```

---

## Summary

| # | Issue | Severity |
|---|---|---|
| 1 | Win tests pass on losses (shown by the mutant) | Blocking |
| 2 | `isWin` uses `>=`; the "payout" test never touches the game | Blocking |
| 3 | Multiplier formula ignores the 1% edge; 0.05 tolerance hides it; one target only | Blocking |
| 4 | `cy.wait(3000)` instead of waiting for the game; it failed 1 run in 3 | Blocking |
| 5 | `testIsolation: false` makes tests depend on each other | Blocking |
| 6 | No Seed B coverage, so the critical tie-roll bug is missed | Blocking |
| — | Unchecked `setTarget`, float money, positional selectors, misleading names, hard-coded URL | Non-blocking |

Happy to pair on the rewrite. Most of #1, #3 and #4 is a few helper functions that could be shared with the rest of the suite. Once #1–#6 are addressed, I'd expect to approve quickly.
