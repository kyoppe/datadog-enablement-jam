// Shared domain types for the DEJ control plane.

export type SessionStatus = "active" | "ended";

// Lifecycle stage of a session:
//   lobby   = created; players register and log into Datadog. Quests hidden.
//   running = the host pressed "問題スタート"; quests are revealed.
//   ended   = closed; no more joins/submissions (leaderboard stays readable).
// `status` is kept (active/ended) for backward compatibility and is derived
// from `phase` (active while lobby|running).
export type SessionPhase = "lobby" | "running" | "ended";

export interface Session {
  id: string;
  name: string;
  // Modules selected for this session (multi-select). A module groups quests.
  moduleIds: string[];
  // Primary module (first selected). Kept for display fallback / legacy reads.
  module?: string;
  createdAt: string;
  // Sessions created before this field default to "active" at read time.
  status: SessionStatus;
  // Sessions created before phases existed are backfilled to "running".
  phase: SessionPhase;
  // When the host started the problem (phase -> running).
  startedAt: string | null;
  endedAt: string | null;
}

export interface Submission {
  at: string;
  // Raw answers keyed by quest answer-field key.
  answers: Record<string, string>;
  // Correctness per answer-field key, evaluated at submit time.
  correct: Record<string, boolean>;
}

// Per-quest progress for a single player. A player works through every quest
// of every module selected for the session; each quest is scored independently
// and the leaderboard aggregates the totals.
export interface QuestProgress {
  questId: string;
  // Raw score; may be negative internally. Always floored at 0 for display.
  score: number;
  solved: boolean;
  // First interaction with this quest (used as the speed-bonus reference).
  startedAt: string;
  solvedAt: string | null;
  hintsUsed: number;
  wrongAnswers: number;
  speedBonus: number;
  lastSubmissionAt: string | null;
  // Indexes of hints already revealed (penalty applied once per hint).
  revealedHints: number[];
  submissions: Submission[];
}

export interface Player {
  // `${sessionId}:${name}` — the entered display name is the identity.
  // The Datadog account is a single shared loaner, so there is no email and no
  // per-user provisioning.
  id: string;
  sessionId: string;
  // Free-text display name (multibyte allowed). Shown as-is on the leaderboard
  // (no anonymity) and used as the dej_player tag value.
  name: string;
  joinedAt: string;
  // When the player confirmed they logged into Datadog (lobby gate). Drives the
  // "logged in" headcount on the admin page and the tem.dej.player.logged_in metric.
  loggedInAt: string | null;
  // When the player declared they are done ("回答を終了"). After this, the player
  // cannot submit answers or reveal hints. Shown on the leaderboard.
  finishedAt: string | null;
  // Keyed by quest id.
  progress: Record<string, QuestProgress>;
}

// Input type for an answer field. "text" is a free-text input; "multi_choice"
// renders checkboxes and is graded as an unordered set of selected values.
export type AnswerFieldType = "text" | "multi_choice";

// A selectable option for a multi_choice field. `value` is used for matching
// (stable id), `label` is shown to the player.
export interface AnswerOption {
  value: string;
  label: string;
}

// One answer field of a quest. Quests now define an ordered list of fields so
// each quest can ask different things, and the order drives the stepwise
// "prompt -> input" layout in the player UI. `expected` and `points` are
// server-only (stripped before the quest is sent to the client).
export interface QuestAnswerField {
  // Stable identifier used as the answers/correct map key.
  key: string;
  // Question shown directly above this field's input (stepwise layout).
  prompt: string;
  // Short label for the input itself.
  label: string;
  // Points awarded once when this field is answered correctly.
  points: number;
  required: boolean;
  // Defaults to "text" when omitted.
  type?: AnswerFieldType;
  // multi_choice only: the selectable options.
  options?: AnswerOption[];
  // Expected answer. Matching is case-insensitive and trimmed (see scoring.ts).
  // string for "text"; string[] (an unordered set) for "multi_choice".
  expected: string | string[];
}

// Client-safe view of an answer field: no expected answer, no points.
export interface PublicAnswerField {
  key: string;
  prompt: string;
  label: string;
  required: boolean;
  type?: AnswerFieldType;
  options?: AnswerOption[];
}

export interface Quest {
  id: string;
  module: string;
  // Scenario is now optional: telemetry is provided by a single always-on data
  // plane that is expanded as new modules/quests are added.
  scenario?: string;
  title: string;
  display_title: string;
  description: string;
  starting_point: string;
  // Path (under NEXT_PUBLIC_DD_APP_URL) to a Datadog view pre-filtered for this
  // quest (e.g. the APM service page or Error Tracking, scoped to env:dej).
  // Rendered as a one-click "open in Datadog" link in the player UI.
  datadog_path?: string;
  // Ordered list of answer fields. Each field carries its own points/expected.
  answer_fields: QuestAnswerField[];
  scoring: {
    // Sum of field points + speed_bonus.max. Displayed score is floored at 0.
    max_score: number;
    hint_penalties: number[];
    speed_bonus?: {
      max: number;
      window_seconds: number;
    };
  };
  hints: { label: string; text: string }[];
}

// Lightweight view of a module config, used by the admin module picker and
// the player quest navigation.
export interface ModuleSummary {
  id: string;
  title: string;
  display_title: string;
  description: string;
  quests: string[];
  default_scenario?: string;
}
