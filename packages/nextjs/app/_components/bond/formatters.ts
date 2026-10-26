export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * A number that could not be read from the chain reads as `unavailable`, never as `0`.
 * The spec forbids showing an empty value, and `0` would be worse: a wrong one.
 */
export const formatNumber = (n: number | null): string => (n === null ? "unavailable" : n.toLocaleString());

export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;
