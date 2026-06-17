import { NextResponse } from "next/server";
import { getOrCreatePlayer, getSession } from "@/lib/store";
import { displayScore, playerTotalScore } from "@/lib/scoring";

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

  // The Datadog account is a single shared loaner, so there is no per-user
  // provisioning. The entered name is the identity and the public display name.
  const player = getOrCreatePlayer(sessionId, name);

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
    name: player.name,
    totalScore: playerTotalScore(player),
    finishedAt: player.finishedAt,
    progress,
  });
}
