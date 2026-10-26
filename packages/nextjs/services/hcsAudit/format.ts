/** Display helpers shared by the issuer's trail and the regulator's feed. */

/** Consensus seconds ("1791960329.444744347") as local date and time, to the second. */
export const formatConsensus = (ts: string) => new Date(Number(ts.split(".")[0]) * 1000).toLocaleString();

/** "0.0.8065084@1791960322.985329131" -> "0.0.8065084@…329131"; show the full id in a title. */
export const shortTx = (tx: string) => (tx.length > 24 ? `${tx.slice(0, tx.indexOf("@") + 1)}…${tx.slice(-6)}` : tx);
