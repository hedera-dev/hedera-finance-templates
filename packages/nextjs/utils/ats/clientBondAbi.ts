// Client-safe: the slice of the bond's ABI the wallet investor's own browser-signed transfer
// needs (plus the errors it might revert with), separate from the server's full ABI.
import { parseAbi } from "viem";

export const clientBondAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "error AccountIsBlocked(address account)",
  "error ListedAccount(address account)",
  "error UnlistedAccount(address account)",
]);
