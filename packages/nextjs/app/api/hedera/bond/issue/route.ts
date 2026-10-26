import { NextResponse } from "next/server";
import { getOperatorConfig } from "~~/services/ats/clients";
import { runIssueBond } from "~~/services/ats/deploy";
import type { IssueBondInput, IssueEvent } from "~~/types/ats";
import { validateIsin } from "~~/utils/ats/isin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ValidationResult = { ok: true; input: IssueBondInput } | { ok: false; error: string };

function validateInput(body: unknown): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const symbol = typeof b.symbol === "string" ? b.symbol.trim() : "";
  const isin = typeof b.isin === "string" ? b.isin.trim().toUpperCase() : "";
  const faceValue = Number(b.faceValue);
  const maturityMonths = Number(b.maturityMonths);
  const maxSupply = Number(b.maxSupply);

  if (!name) return { ok: false, error: "Bond name is required." };
  if (!symbol) return { ok: false, error: "Bond symbol is required." };

  const isinCheck = validateIsin(isin);
  if (!isinCheck.valid) return { ok: false, error: isinCheck.reason };

  if (!Number.isInteger(faceValue) || faceValue <= 0) {
    return { ok: false, error: "Face value must be a positive whole number." };
  }
  if (!Number.isInteger(maturityMonths) || maturityMonths < 1 || maturityMonths > 120) {
    return { ok: false, error: "Maturity must be a whole number of months between 1 and 120." };
  }
  if (!Number.isInteger(maxSupply) || maxSupply <= 0) {
    return { ok: false, error: "Max supply must be a positive whole number." };
  }

  return { ok: true, input: { name, symbol, isin, faceValue, maturityMonths, maxSupply } };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const validated = validateInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const operator = getOperatorConfig();
  if (!operator.configured) {
    return NextResponse.json({ error: operator.error }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IssueEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runIssueBond(validated.input, emit);
      } catch (error) {
        emit({ step: "result", status: "failed", error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
