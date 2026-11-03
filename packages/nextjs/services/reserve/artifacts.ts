// Server-only: the desk's own contracts, as compiled by Foundry (`yarn foundry:compile`).
import fs from "node:fs";
import path from "node:path";
import type { Abi, Hex } from "viem";

type Artifact = { abi: Abi; bytecode: Hex };

function candidates(file: string, name: string): string[] {
  const relative = path.join("packages", "foundry", "out", file, `${name}.json`);
  return [
    path.resolve(process.cwd(), "..", "foundry", "out", file, `${name}.json`),
    path.resolve(process.cwd(), relative),
  ];
}

export function loadArtifact(file: string, name: string): Artifact {
  for (const candidate of candidates(file, name)) {
    if (!fs.existsSync(candidate)) continue;
    const json = JSON.parse(fs.readFileSync(candidate, "utf8")) as { abi: Abi; bytecode: { object: string } };
    return { abi: json.abi, bytecode: json.bytecode.object as Hex };
  }
  throw new Error(`The ${name} artifact is missing. Run \`yarn foundry:compile\` first.`);
}

export const reserveFeedArtifact = () => loadArtifact("ReserveFeed.sol", "ReserveFeed");
export const reserveGateArtifact = () => loadArtifact("ReserveGate.sol", "ReserveGate");
