import { NextResponse } from "next/server";
import { markPlayerFinished, getSession } from "@/lib/store";

// POST /api/finish  { sessionId, name }
// A player declares they are done answering. After this, the player can no
// longer submit answers or reveal hints. Idempotent.
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
  const player = markPlayerFinished(sessionId, name);
  if (!player) {
    return NextResponse.json({ error: "player has not joined" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, finishedAt: player.finishedAt });
}
