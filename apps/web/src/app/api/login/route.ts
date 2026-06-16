import { NextResponse } from "next/server";
import { getSession, markPlayerLoggedIn, loginStats } from "@/lib/store";
import { reportPlayerLoggedIn } from "@/lib/datadog-server";

// POST /api/login  { sessionId, email }
// A player confirms ("ログインしました") that they logged into Datadog. Records
// the timestamp and emits the tem.dej.player.logged_in metric for the live host
// QueryValue widget. Idempotent.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sessionId = (body.sessionId as string)?.trim();
  const email = (body.email as string)?.trim().toLowerCase();
  if (!sessionId || !email) {
    return NextResponse.json(
      { error: "sessionId and email are required" },
      { status: 400 },
    );
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status === "ended") {
    return NextResponse.json({ error: "session has ended" }, { status: 409 });
  }
  const player = markPlayerLoggedIn(sessionId, email);
  if (!player) {
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  }
  await reportPlayerLoggedIn(player, sessionId);
  return NextResponse.json({ ok: true, loggedInAt: player.loggedInAt, login: loginStats(sessionId) });
}
