import { NextResponse } from "next/server";
import { getPlayer, updatePlayer, getSession } from "@/lib/store";
import { loadQuest, loadQuestsForModules } from "@/lib/quest";
import {
  applyHint,
  getOrInitProgress,
  displayScore,
  playerTotalScore,
} from "@/lib/scoring";
import { reportPlayerScore } from "@/lib/datadog-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sessionId = (body.sessionId as string)?.trim();
  const name = (body.name as string)?.trim();
  const questId = (body.questId as string)?.trim();
  const hintIndex = Number(body.hintIndex);
  if (!sessionId || !name || !questId || Number.isNaN(hintIndex)) {
    return NextResponse.json(
      { error: "sessionId, name, questId and hintIndex are required" },
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

  const validQuestIds = loadQuestsForModules(session.moduleIds).map((q) => q.id);
  if (!validQuestIds.includes(questId)) {
    return NextResponse.json({ error: "quest not in session" }, { status: 400 });
  }

  const player = getPlayer(sessionId, name);
  if (!player) {
    return NextResponse.json({ error: "player has not joined" }, { status: 404 });
  }
  if (player.finishedAt) {
    return NextResponse.json({ error: "player has finished" }, { status: 409 });
  }
  const quest = loadQuest(questId);
  const progress = getOrInitProgress(player, questId);
  applyHint(progress, quest, hintIndex);
  updatePlayer(player);
  await reportPlayerScore(player, sessionId);

  return NextResponse.json({
    questId,
    questScore: displayScore(progress),
    totalScore: playerTotalScore(player),
    hintsUsed: progress.hintsUsed,
    revealedHints: progress.revealedHints,
  });
}
