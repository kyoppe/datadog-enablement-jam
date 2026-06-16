import { NextResponse } from "next/server";
import { getSession, startSession, endSession, deleteSession, loginStats } from "@/lib/store";

// GET: current session state plus lobby login headcount. Polled by the player
// lobby (to detect "問題スタート") and by the admin page (login progress).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  return NextResponse.json({ session, login: loginStats(sessionId) });
}

// PATCH: advance the session lifecycle.
//   { action: "start" } lobby -> running (reveal quests)
//   { action: "end" }   -> ended (close)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action ?? "end";
  if (action !== "end" && action !== "start") {
    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  }
  const session = action === "start" ? startSession(sessionId) : endSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

// DELETE: permanently remove a session and its players.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const removed = deleteSession(sessionId);
  if (!removed) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
