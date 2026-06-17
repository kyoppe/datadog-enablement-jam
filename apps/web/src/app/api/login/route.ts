import { NextResponse } from "next/server";
import { getSession, markPlayerLoggedIn, loginStats } from "@/lib/store";
import { reportPlayerLoggedIn } from "@/lib/datadog-server";

// POST /api/login  { sessionId, name }
// A player confirms ("ログインしました") that they logged into Datadog. Records
// the timestamp and emits the tem.dej.player.logged_in metric for the live host
// QueryValue widget. Idempotent.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sessionId = (body.sessionId as string)?.trim();
  const name = (body.name as string)?.trim();
  if (!sessionId || !name) {
    return NextResponse.json(
      { error: "sessionId and name are required" },
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
  const player = markPlayerLoggedIn(sessionId, name);
  if (!player) {
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  }
  await reportPlayerLoggedIn(player, sessionId);
  return NextResponse.json({ ok: true, loggedInAt: player.loggedInAt, login: loginStats(sessionId) });
}
