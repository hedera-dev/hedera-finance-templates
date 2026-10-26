/**
 * The bond's start and maturity dates, as the factory is asked for them.
 *
 * Client- and server-safe: no imports, so the same arithmetic can be exercised in a test.
 */
export type BondDates = { startingDate: bigint; maturityDate: bigint };

/** The bond starts a few minutes out, so the factory never sees a start date in the past. */
export const START_DELAY_SECONDS = 5 * 60;

/**
 * `maturityMonths` after the start date, on the calendar.
 *
 * Adding months to a day-of-month that the target month does not have overflows in
 * JavaScript: 31 January plus one month is 3 March, not 28 February. So the day is
 * clamped to the last day of the target month, which is what a bond's schedule means
 * by "one month later".
 */
export function bondDates(nowSeconds: number, maturityMonths: number): BondDates {
  const startSeconds = nowSeconds + START_DELAY_SECONDS;
  const start = new Date(startSeconds * 1000);

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + maturityMonths;
  const day = start.getUTCDate();
  // Day 0 of the following month is the last day of the month we want.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const maturity = new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDayOfTargetMonth),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
    ),
  );

  return { startingDate: BigInt(startSeconds), maturityDate: BigInt(Math.floor(maturity.getTime() / 1000)) };
}
