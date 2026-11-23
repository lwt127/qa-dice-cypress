/**
 * Independent oracle for Joy Dice, derived only from the rules in the assessment brief.
 * Nothing here reads from the UI, so a UI bug cannot leak into the expected values.
 *
 * Units:
 *  - Rolls and targets are integer hundredths (0..10000 => 0.00..100.00).
 *  - Money is integer "ticks" of 0.0001 (the game shows balances to 4 decimals).
 *  - The multiplier is an exact decimal (BigInt digits + scale) to avoid float error.
 */

export const TOTAL_ROLLS = 10_001; // 0.00, 0.01, ... 100.00
export type Direction = 'over' | 'under';

export interface Decimal {
  digits: bigint;
  scale: number; // value = digits / 10^scale
}

export function toHundredths(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Not a 2-decimal number: "${value}"`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function formatHundredths(h: number): string {
  return `${Math.floor(h / 100)}.${String(h % 100).padStart(2, '0')}`;
}

export function winningRolls(dir: Direction, targetH: number): number {
  return dir === 'over' ? 10_000 - targetH : targetH;
}

export function isWin(dir: Direction, targetH: number, rollH: number): boolean {
  return dir === 'over' ? rollH > targetH : rollH < targetH;
}

/** 0.99 / (wins / 10001), cut (not rounded) to 5 significant digits. */
export function multiplier(dir: Direction, targetH: number): Decimal {
  const wins = BigInt(winningRolls(dir, targetH));
  if (wins <= 0n) throw new Error('No winning rolls');
  const num = 99n * BigInt(TOTAL_ROLLS);
  const den = 100n * wins;
  const at = (scale: number) =>
    scale >= 0 ? (num * 10n ** BigInt(scale)) / den : num / (den * 10n ** BigInt(-scale));
  let scale = 0;
  while (at(scale) >= 100_000n) scale--;
  while (at(scale) < 10_000n) scale++;
  return { digits: at(scale), scale };
}

/** Exact win chance in %, rounded half-up to 2 decimals (the UI's display precision). */
export function winChancePercent(dir: Direction, targetH: number): string {
  const wins = BigInt(winningRolls(dir, targetH));
  const total = BigInt(TOTAL_ROLLS);
  const hundredthsOfPercent = (wins * 10_000n * 2n + total) / (2n * total);
  return formatHundredths(Number(hundredthsOfPercent));
}

/** Exact win chance in %, unrounded, for tolerance comparisons. */
export function winChanceExact(dir: Direction, targetH: number): number {
  return (winningRolls(dir, targetH) * 100) / TOTAL_ROLLS;
}

export function formatDecimal(d: Decimal): string {
  const s = d.digits.toString().padStart(d.scale + 1, '0');
  const int = d.scale > 0 ? s.slice(0, -d.scale) : s + '0'.repeat(-d.scale);
  const frac = d.scale > 0 ? s.slice(-d.scale).replace(/0+$/, '') : '';
  return frac ? `${int}.${frac}` : int;
}

/** Normalise a UI number string ("1.9040", "1.904") for exact comparison. */
export function normaliseNumber(s: string): string {
  const t = s.trim().replace(/,/g, '');
  return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
}

// ---- money ---------------------------------------------------------------

export const TICKS_PER_UNIT = 10_000;

export function parseMoney(text: string): number {
  const m = /^(-?)([\d,]+)(?:\.(\d{1,4}))?$/.exec(text.trim());
  if (!m) throw new Error(`Not a money value: "${text}"`);
  const ticks = Number(m[2].replace(/,/g, '')) * TICKS_PER_UNIT + Number((m[3] ?? '').padEnd(4, '0'));
  return m[1] ? -ticks : ticks;
}

export function money(units: string | number): number {
  return parseMoney(typeof units === 'number' ? units.toFixed(4) : units);
}

export function formatMoney(ticks: number): string {
  const sign = ticks < 0 ? '-' : '';
  const abs = Math.abs(ticks);
  const int = Math.floor(abs / TICKS_PER_UNIT).toLocaleString('en-US');
  return `${sign}${int}.${String(abs % TICKS_PER_UNIT).padStart(4, '0')}`;
}

/** bet x multiplier, in ticks. Throws if the result is not representable to 4 decimals. */
export function payout(betTicks: number, mult: Decimal): number {
  const raw = BigInt(betTicks) * mult.digits;
  const div = 10n ** BigInt(mult.scale);
  if (raw % div !== 0n) {
    throw new Error(`Payout ${betTicks}x${formatDecimal(mult)} is not exact at 4dp; choose a different bet`);
  }
  return Number(raw / div);
}

/** Balance change for one bet: +payout-bet on a win, -bet on a loss. */
export function balanceDelta(betTicks: number, won: boolean, mult: Decimal): number {
  return won ? payout(betTicks, mult) - betTicks : -betTicks;
}
