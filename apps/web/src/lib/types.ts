// Shared domain types for the DEJ control plane.

export type SessionStatus = "active" | "ended";

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
  endedAt: string | null;
}

export interface Submission {
  rootCauseService?: string;
  affectedResource?: string;
  evidenceUrl?: string;
  at: string;
  correctRootCause: boolean;
  correctResource: boolean;
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
  // `${sessionId}:${email}` — email is the stable identity.
  id: string;
  sessionId: string;
  // Email is the login/identity used to provision the Datadog org user.
  email: string;
  // Real name for the Datadog user record. Never shown on public UI/leaderboard.
  name: string;
  // Anonymous public handle shown on the play screen and leaderboard.
  handle: string;
  // Whether a Datadog org user has been provisioned for this player.
  provisioned: boolean;
  joinedAt: string;
  // Keyed by quest id.
  progress: Record<string, QuestProgress>;
}

export interface QuestAnswerField {
  label: string;
  required: boolean;
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
  answer_fields: Record<string, QuestAnswerField>;
  expected: {
    root_cause_service: string;
    affected_resource: string;
  };
  scoring: {
    points: {
      root_cause_service: number;
      affected_resource: number;
      evidence_url: number;
    };
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
