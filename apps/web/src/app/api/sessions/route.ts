import { NextResponse } from "next/server";
import { createSession, listSessions, getActiveSession } from "@/lib/store";
import { listModules } from "@/lib/module";
import type { Session } from "@/lib/types";

// Generate a short, human-friendly session id.
function generateSessionId(): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `s-${ts}-${rand}`;
}

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}

export async function POST(request: Request) {
  // Only one active session at a time: the shared data plane serves one session.
  const active = getActiveSession();
  if (active) {
    return NextResponse.json(
      { error: "an active session already exists", activeSessionId: active.id },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const available = listModules().map((m) => m.id);

  const requested = Array.isArray(body.moduleIds)
    ? (body.moduleIds as unknown[]).map(String)
    : [];
  // Keep only known modules, preserving request order; default to the first
  // available module if nothing valid was selected.
  let moduleIds = requested.filter((id) => available.includes(id));
  if (moduleIds.length === 0) {
    if (available.length === 0) {
      return NextResponse.json({ error: "no modules are configured" }, { status: 400 });
    }
    moduleIds = [available[0]];
  }

  const session: Session = {
    id: generateSessionId(),
    name: (body.name as string)?.trim() || "Untitled session",
    moduleIds,
    module: moduleIds[0],
    createdAt: new Date().toISOString(),
    status: "active",
    endedAt: null,
  };
  createSession(session);
  return NextResponse.json(session, { status: 201 });
}
