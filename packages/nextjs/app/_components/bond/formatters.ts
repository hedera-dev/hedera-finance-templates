export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * A number that could not be read from the chain reads as `unavailable`, never as `0`.
 * The spec forbids showing an empty value, and `0` would be worse: a wrong one.
 */
export const formatNumber = (n: number | null): string => (n === null ? "unavailable" : n.toLocaleString());

export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * A refusal's sentence, without the error name the caller already shows in front of it.
 *
 * A decoded revert arrives as `AccountIsBlocked(0x27c7…)`, which repeats that name and adds a
 * raw address: there is no sentence in it, so this returns none and the caller shows the name
 * alone. Only a message that says something the name does not becomes the sentence.
 */
export const refusalSentence = (result: { result: string; message: string }, meaning?: string): string => {
  const message = result.message.startsWith(`${result.result}(`) ? "" : result.message;
  const sentence = message === "" || message === result.result ? (meaning ?? "") : message;
  const short = sentence.replace(/0x[0-9a-fA-F]{40}/g, address => shortAddress(address));
  return short.charAt(0).toUpperCase() + short.slice(1);
};
