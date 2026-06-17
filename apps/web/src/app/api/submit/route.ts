import { NextResponse } from "next/server";
import { getPlayer, updatePlayer, getSession } from "@/lib/store";
import { loadQuest, loadQuestsForModules } from "@/lib/quest";
import {
  applySubmission,
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
  if (!sessionId || !name || !questId) {
    return NextResponse.json(
      { error: "sessionId, name and questId are required" },
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

  // Quest must belong to one of the session's modules.
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
  // Answers are a { fieldKey: value } map driven by the quest's answer_fields.
  const answers = (body.answers ?? {}) as Record<string, unknown>;
  const input: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    input[key] = typeof value === "string" ? value : "";
  }
  const result = applySubmission(progress, quest, input);
  updatePlayer(player);
  await reportPlayerScore(player, sessionId);

  return NextResponse.json({
    verdict: result.verdict,
    questId,
    questScore: displayScore(result.progress),
    totalScore: playerTotalScore(player),
    gained: result.gained,
    speedBonus: result.speedBonus,
    solved: result.progress.solved,
  });
}
