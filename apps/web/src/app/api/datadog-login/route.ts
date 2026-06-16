import { NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { getDatadogLogin } from "@/lib/datadog-server";

// GET /api/datadog-login?sessionId=...
// Returns the shared, read-only Datadog login shown to players in the lobby.
// Server-only: the credentials live in .env.local and are never inlined into
// the browser bundle. Gated on a valid, non-ended session so the endpoint is
// not an open credential dump.
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status === "ended") {
    return NextResponse.json({ error: "session has ended" }, { status: 409 });
  }
  const login = getDatadogLogin();
  if (!login) {
    return NextResponse.json({ error: "login not configured" }, { status: 503 });
  }
  return NextResponse.json(login);
}
