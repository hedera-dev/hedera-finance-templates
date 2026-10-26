// Server-only: decodes a viem revert into the ATS custom error's name, e.g. "AccountIsBlocked",
// so the activity log can show the refusal decoded rather than a raw revert selector.
import { BaseError, ContractFunctionRevertedError } from "viem";

export type DecodedAtsError = { name: string; message: string };

/**
 * Why a request really failed.
 *
 * `fetch` reports every connection-level problem as `TypeError: fetch failed` and puts the
 * reason — `ENOTFOUND`, `ECONNREFUSED`, a TLS error — in `cause`. Reporting only the message
 * tells a reader their issue failed and nothing they can act on, which is exactly what it did.
 */
function describeCause(error: unknown): string {
  const parts: string[] = [];
  let cause: unknown = (error as { cause?: unknown })?.cause;
  for (let depth = 0; cause instanceof Error && depth < 4; depth++) {
    const code = (cause as { code?: string }).code;
    const text = code && !cause.message.includes(code) ? `${code}: ${cause.message}` : cause.message;
    if (text && !parts.includes(text)) parts.push(text);
    cause = (cause as { cause?: unknown }).cause;
  }
  return parts.join(" — ");
}

/** The message plus whatever its cause chain adds, when the cause says more than the message. */
function withCause(message: string, error: unknown): string {
  const cause = describeCause(error);
  return cause ? `${message} (${cause})` : message;
}

export function decodeAtsError(error: unknown): DecodedAtsError {
  if (error instanceof BaseError) {
    const revertError = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName ?? revertError.reason ?? revertError.signature ?? "Reverted";
      const args = revertError.data?.args ?? [];
      const message = args.length ? `${errorName}(${args.join(", ")})` : errorName;
      return { name: errorName, message };
    }
    // viem's own `message` carries the request body and the raw call arguments — thousands
    // of hex characters — and its cause chain repeats them. `shortMessage` plus the relay's
    // `details` is the part a reader can act on.
    const short = error.shortMessage ?? error.message;
    const details = (error as { details?: string }).details?.trim();
    return { name: "Error", message: details && !short.includes(details) ? `${short} ${details}` : short };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { name: "Error", message: withCause(message, error) };
}
