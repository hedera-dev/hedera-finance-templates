import { NextResponse } from "next/server";
import { getOperatorCredentials, missingOperatorEnvVars } from "~~/services/hedera/env";

export async function GET() {
  return NextResponse.json({
    operatorConfigured: getOperatorCredentials() != null,
    missingEnvVars: missingOperatorEnvVars(),
  });
}
