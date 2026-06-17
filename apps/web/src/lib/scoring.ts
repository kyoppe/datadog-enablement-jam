// Scoring logic for DEJ. Driven entirely by the quest config so points,
// penalties, and answers can change without touching code. Scoring is per-quest;
// the leaderboard aggregates each player's quest scores.
import type { Quest, QuestAnswerField, Player, QuestProgress } from "./types";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

// Whether a submitted value matches the field's expected answer.
// - text: case-insensitive, trimmed equality.
// - multi_choice: the submitted value is a comma-separated list of selected
//   option values; it must equal the expected set (order-independent).
function fieldMatches(field: QuestAnswerField, value: string | undefined): boolean {
  if (field.type === "multi_choice") {
    const expected = (Array.isArray(field.expected) ? field.expected : [field.expected])
      .map(normalize)
      .filter(Boolean)
      .sort();
    const got = (value ?? "")
      .split(",")
      .map(normalize)
      .filter(Boolean)
      .sort();
    return (
      expected.length === got.length && expected.every((v, i) => v === got[i])
    );
  }
  const expected = Array.isArray(field.expected) ? field.expected[0] : field.expected;
  return normalize(value) === normalize(expected);
}

// Raw answers keyed by quest answer-field key.
export type SubmissionInput = Record<string, string>;

export interface ScoreResult {
  progress: QuestProgress;
  // Correctness of each field in this submission, keyed by field key.
  correct: Record<string, boolean>;
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

// Number of quests the player has answered (submitted at least once). A hint
// alone does not count as an answer.
export function playerAnsweredCount(player: Player): number {
  return Object.values(player.progress).filter((p) => p.submissions.length > 0)
    .length;
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

// Whether a given field has ever been answered correctly across submissions.
function fieldEverCorrect(progress: QuestProgress, key: string): boolean {
  return progress.submissions.some((s) => s.correct?.[key]);
}

// Apply a submission to a quest's progress and return the updated progress +
// verdict. CTF-style: each correct field adds its points once; wrong answers
// never subtract (they are only counted). `solved` requires every required
// field to have been answered correctly (across history). A speed bonus is
// granted on the first full solve.
export function applySubmission(
  progress: QuestProgress,
  quest: Quest,
  input: SubmissionInput,
): ScoreResult {
  const fields = quest.answer_fields;

  const correct: Record<string, boolean> = {};
  for (const f of fields) {
    correct[f.key] = fieldMatches(f, input[f.key]);
  }

  // Award each field's points at most once (first time it is correct).
  let gained = 0;
  for (const f of fields) {
    if (correct[f.key] && !fieldEverCorrect(progress, f.key)) {
      gained += f.points;
    }
  }

  // Wrong answers are counted but never penalize the score.
  const anyCorrectNow = fields.some((f) => correct[f.key]);
  if (!anyCorrectNow) {
    progress.wrongAnswers += 1;
  }

  progress.lastSubmissionAt = new Date().toISOString();
  const answers: Record<string, string> = {};
  for (const f of fields) answers[f.key] = input[f.key] ?? "";
  progress.submissions.push({
    at: progress.lastSubmissionAt,
    answers,
    correct,
  });

  // Solved once every required field has been answered correctly at some point.
  const wasSolved = progress.solved;
  progress.solved = fields
    .filter((f) => f.required)
    .every((f) => fieldEverCorrect(progress, f.key));

  // Speed bonus on the first full solve only.
  let speedBonus = 0;
  if (progress.solved && !wasSolved) {
    progress.solvedAt = progress.lastSubmissionAt;
    speedBonus = computeSpeedBonus(quest, progress.startedAt, progress.solvedAt);
    progress.speedBonus = speedBonus;
    gained += speedBonus;
  }

  progress.score += gained;

  const correctCount = fields.filter((f) => correct[f.key]).length;
  let verdict: ScoreResult["verdict"] = "incorrect";
  if (fields.length > 0 && correctCount === fields.length) verdict = "correct";
  else if (correctCount > 0) verdict = "partiallyCorrect";

  return { progress, correct, gained, speedBonus, verdict };
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
