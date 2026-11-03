import { ScheduleId } from "@hiero-ledger/sdk";

/**
 * The one thing an EVM wallet can do to a Hedera schedule.
 *
 * HRC-755 adds a facade method to every schedule entity: an ordinary Ethereum transaction sent to
 * the schedule's own address, calling the parameterless `signSchedule()`, makes the network add the
 * sender's key to that schedule's signature list. No ABI, no contract, no SDK in the browser — the
 * call data is the selector and nothing else, and the wallet prompts for it like any transfer.
 */
export const SIGN_SCHEDULE_SELECTOR = "0x06d15889";

/** The long-zero address a `0.0.<num>` schedule is reachable at from an EVM wallet. */
export function scheduleEvmAddress(scheduleId: string): `0x${string}` {
  return `0x${ScheduleId.fromString(scheduleId).toSolidityAddress()}`;
}
