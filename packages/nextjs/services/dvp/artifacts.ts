// Server-only: the settlement contract's bytecode, as compiled by Foundry (`yarn foundry:compile`).
import fs from "node:fs";
import path from "node:path";
import type { Hex } from "viem";

/** Both layouts: the Next dev server runs in `packages/nextjs`, a production build from the root. */
function candidates(file: string, name: string): string[] {
  return [
    path.resolve(process.cwd(), "..", "foundry", "out", file, `${name}.json`),
    path.resolve(process.cwd(), "packages", "foundry", "out", file, `${name}.json`),
  ];
}

function loadBytecode(file: string, name: string): Hex {
  for (const candidate of candidates(file, name)) {
    if (!fs.existsSync(candidate)) continue;
    const json = JSON.parse(fs.readFileSync(candidate, "utf8")) as { bytecode: { object: string } };
    return json.bytecode.object as Hex;
  }
  throw new Error(`The ${name} artifact is missing. Run \`yarn foundry:compile\` first.`);
}

export const dvpSettlementBytecode = () => loadBytecode("DvpSettlement.sol", "DvpSettlement");
