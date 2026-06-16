// Scoring logic for DEJ. Driven entirely by the quest config so points,
// penalties, and answers can change without touching code. Scoring is per-quest;
// the leaderboard aggregates each player's quest scores.
import type { Quest, Player, QuestProgress } from "./types";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export interface SubmissionInput {
  rootCauseService?: string;
  affectedResource?: string;
  evidenceUrl?: string;
}

export interface ScoreResult {
  progress: QuestProgress;
  correctRootCause: boolean;
  correctResource: boolean;
  evidenceProvided: boolean;
  gained: number;
  speedBonus: number;
  // Verdict key maps to i18n score messages.
  verdict: "correct" | "partiallyCorrect" | "incorrect";
}

// Create an empty progress record for a quest.
export function newQuestProgress(questId: string): QuestProgress {
  const now = new Date().toISOString();
  return {
    questId,
    score: 0,
    solved: false,
    startedAt: now,
    solvedAt: null,
    hintsUsed: 0,
    wrongAnswers: 0,
    speedBonus: 0,
    lastSubmissionAt: null,
    revealedHints: [],
    submissions: [],
  };
}

// Ensure a player has a progress entry for the quest, creating it on first use.
export function getOrInitProgress(player: Player, questId: string): QuestProgress {
  let progress = player.progress[questId];
  if (!progress) {
    progress = newQuestProgress(questId);
    player.progress[questId] = progress;
  }
  return progress;
}

// Displayed/ranked score for a single quest is never negative, even if hints
// pushed the raw score below zero.
export function displayScore(progress: QuestProgress): number {
  return Math.max(0, progress.score);
}

// Aggregate score across all quests (each quest floored at 0, then summed).
export function playerTotalScore(player: Player): number {
  return Object.values(player.progress).reduce((sum, p) => sum + displayScore(p), 0);
}

export function playerSolvedCount(player: Player): number {
  return Object.values(player.progress).filter((p) => p.solved).length;
}

export function playerHintsUsed(player: Player): number {
  return Object.values(player.progress).reduce((sum, p) => sum + p.hintsUsed, 0);
}

export function playerWrongAnswers(player: Player): number {
  return Object.values(player.progress).reduce((sum, p) => sum + p.wrongAnswers, 0);
}

export function playerSpeedBonus(player: Player): number {
  return Object.values(player.progress).reduce((sum, p) => sum + p.speedBonus, 0);
}

// Most recent solve time across quests (used as a tie-break on the leaderboard).
export function playerLastSolvedAt(player: Player): string | null {
  return Object.values(player.progress)
    .map((p) => p.solvedAt)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1) ?? null;
}

export function playerLastSubmissionAt(player: Player): string | null {
  return Object.values(player.progress)
    .map((p) => p.lastSubmissionAt)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1) ?? null;
}

// Time bonus, awarded once on solve. Decays linearly from `max` to 0 over
// `window_seconds`, measured from when the player first engaged with the quest.
function computeSpeedBonus(quest: Quest, startedAt: string, solvedAt: string): number {
  const cfg = quest.scoring.speed_bonus;
  if (!cfg) return 0;
  const elapsedSec = (new Date(solvedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  const ratio = Math.max(0, Math.min(1, 1 - elapsedSec / cfg.window_seconds));
  return Math.round(cfg.max * ratio);
}

// Apply a submission to a quest's progress and return the updated progress +
// verdict. CTF-style: correct fields add points once; wrong answers never
// subtract (they are only counted). A speed bonus is granted on the first solve.
export function applySubmission(
  progress: QuestProgress,
  quest: Quest,
  input: SubmissionInput,
): ScoreResult {
  const correctRootCause =
    normalize(input.rootCauseService) === normalize(quest.expected.root_cause_service);
  const correctResource =
    normalize(input.affectedResource) === normalize(quest.expected.affected_resource);
  const evidenceProvided = normalize(input.evidenceUrl).length > 0;

  // Award each component at most once.
  const alreadyRootCause = progress.submissions.some((s) => s.correctRootCause);
  const alreadyResource = progress.submissions.some((s) => s.correctResource);
  const alreadyEvidence = progress.submissions.some(
    (s) => normalize(s.evidenceUrl).length > 0,
  );

  let gained = 0;
  if (correctRootCause && !alreadyRootCause) {
    gained += quest.scoring.points.root_cause_service;
  }
  if (correctResource && !alreadyResource) {
    gained += quest.scoring.points.affected_resource;
  }
  if (evidenceProvided && !alreadyEvidence) {
    gained += quest.scoring.points.evidence_url;
  }

  // Wrong answers are counted but never penalize the score.
  const anyCorrectNow = correctRootCause || correctResource;
  if (!anyCorrectNow) {
    progress.wrongAnswers += 1;
  }

  progress.lastSubmissionAt = new Date().toISOString();
  progress.submissions.push({
    rootCauseService: input.rootCauseService,
    affectedResource: input.affectedResource,
    evidenceUrl: input.evidenceUrl,
    at: progress.lastSubmissionAt,
    correctRootCause,
    correctResource,
  });

  const wasSolved = progress.solved;
  progress.solved = correctRootCause || alreadyRootCause;

  // Speed bonus on the first solve only.
  let speedBonus = 0;
  if (progress.solved && !wasSolved) {
    progress.solvedAt = progress.lastSubmissionAt;
    speedBonus = computeSpeedBonus(quest, progress.startedAt, progress.solvedAt);
    progress.speedBonus = speedBonus;
    gained += speedBonus;
  }

  progress.score += gained;

  let verdict: ScoreResult["verdict"] = "incorrect";
  if (correctRootCause && correctResource) verdict = "correct";
  else if (correctRootCause || correctResource) verdict = "partiallyCorrect";

  return {
    progress,
    correctRootCause,
    correctResource,
    evidenceProvided,
    gained,
    speedBonus,
    verdict,
  };
}

// Reveal a hint, applying its penalty once. The raw score may go negative;
// display/ranking floors it at 0 via displayScore().
export function applyHint(
  progress: QuestProgress,
  quest: Quest,
  hintIndex: number,
): QuestProgress {
  if (progress.revealedHints.includes(hintIndex)) return progress;
  const penalty = quest.scoring.hint_penalties[hintIndex] ?? 0;
  progress.score += penalty;
  progress.hintsUsed += 1;
  progress.revealedHints.push(hintIndex);
  return progress;
}
