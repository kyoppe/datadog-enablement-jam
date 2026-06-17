import { NextResponse } from "next/server";
import { listPlayers, getSession } from "@/lib/store";
import { loadQuestsForModules } from "@/lib/quest";
import {
  playerTotalScore,
  playerSolvedCount,
  playerAnsweredCount,
  playerHintsUsed,
  playerWrongAnswers,
  playerSpeedBonus,
  playerLastSolvedAt,
  playerLastSubmissionAt,
} from "@/lib/scoring";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  const totalQuests = session
    ? loadQuestsForModules(session.moduleIds).length
    : 0;

  const players = listPlayers(sessionId)
    .map((p) => {
      const solvedCount = playerSolvedCount(p);
      return {
        name: p.name,
        score: playerTotalScore(p),
        solvedCount,
        answeredCount: playerAnsweredCount(p),
        totalQuests,
        solved: totalQuests > 0 && solvedCount >= totalQuests,
        hintsUsed: playerHintsUsed(p),
        wrongAnswers: playerWrongAnswers(p),
        speedBonus: playerSpeedBonus(p),
        solvedAt: playerLastSolvedAt(p),
        lastSubmissionAt: playerLastSubmissionAt(p),
        finishedAt: p.finishedAt,
      };
    })
    // Rank by total score desc, then by earliest most-recent solve (faster wins).
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
      if (a.solvedAt && b.solvedAt) return a.solvedAt.localeCompare(b.solvedAt);
      if (a.solvedAt) return -1;
      if (b.solvedAt) return 1;
      return 0;
    });

  return NextResponse.json({ players });
}
