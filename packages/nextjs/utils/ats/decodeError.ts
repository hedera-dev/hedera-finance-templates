// Client-safe mirror of the server's decodeAtsError: turns a viem revert into the ATS custom
// error's bare name (e.g. "AccountIsBlocked") for the activity log's result column.
import { BaseError, ContractFunctionRevertedError } from "viem";

export function decodeAtsErrorName(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.reason ?? revertError.signature ?? "Error";
    }
    return error.shortMessage ?? "Error";
  }
  return error instanceof Error ? error.message : String(error);
}
