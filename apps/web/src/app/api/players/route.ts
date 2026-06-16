import { NextResponse } from "next/server";
import { getOrCreatePlayer, updatePlayer, getSession } from "@/lib/store";
import { displayScore, playerTotalScore } from "@/lib/scoring";
import { provisionDatadogUser } from "@/lib/datadog-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sessionId = (body.sessionId as string)?.trim();
  const email = (body.email as string)?.trim().toLowerCase();
  const name = (body.name as string)?.trim();
  if (!sessionId || !email || !name) {
    return NextResponse.json(
      { error: "sessionId, email and name are required" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  if (session.status === "ended") {
    return NextResponse.json({ error: "session has ended" }, { status: 409 });
  }

  const player = getOrCreatePlayer(sessionId, email, name);

  // Provision a Datadog org user once (no-op in test mode).
  if (!player.provisioned) {
    const result = await provisionDatadogUser(email, name);
    if (result.provisioned) {
      player.provisioned = true;
      updatePlayer(player);
    }
  }

  const progress = Object.fromEntries(
    Object.values(player.progress).map((p) => [
      p.questId,
      {
        questScore: displayScore(p),
        solved: p.solved,
        revealedHints: p.revealedHints,
        speedBonus: p.speedBonus,
      },
    ]),
  );

  return NextResponse.json({
    handle: player.handle,
    totalScore: playerTotalScore(player),
    progress,
  });
}
