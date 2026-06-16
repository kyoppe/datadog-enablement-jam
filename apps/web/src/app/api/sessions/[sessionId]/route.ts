import { NextResponse } from "next/server";
import { endSession, deleteSession } from "@/lib/store";

// PATCH: end (close) a session. Body: { action: "end" }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.action && body.action !== "end") {
    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  }
  const session = endSession(sessionId);
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
