// Server-side Datadog integration for the control plane.
//
// Two responsibilities:
//   1. Submit player scores as custom metrics (time-series leaderboard).
//   2. Provision Datadog org users so participants can log into the UI.
//
// Both are gated behind env flags so day-to-day testing never creates real
// users or pollutes metrics. Defaults are OFF (test mode): actions are logged
// instead of executed.
//
// Secrets (DD_API_KEY / DD_APP_KEY) are server-only — never expose via
// NEXT_PUBLIC_*.
import type { Player } from "./types";
import { loadQuest } from "./quest";
import { displayScore } from "./scoring";

const SITE = process.env.DD_SITE || process.env.NEXT_PUBLIC_DD_SITE || "datadoghq.com";
const ENV = process.env.DD_ENV || process.env.NEXT_PUBLIC_DD_ENV || "dej";
const API_KEY = process.env.DD_API_KEY;
const APP_KEY = process.env.DD_APP_KEY;
const ROLE_ID = process.env.DEJ_DATADOG_ROLE_ID;
const SEND_METRICS = process.env.DEJ_SEND_METRICS === "true";
const PROVISION_USERS = process.env.DEJ_PROVISION_USERS === "true";

function apiBase(): string {
  return `https://api.${SITE}`;
}

export function metricsEnabled(): boolean {
  return SEND_METRICS && Boolean(API_KEY);
}

export function provisionEnabled(): boolean {
  return PROVISION_USERS && Boolean(API_KEY) && Boolean(APP_KEY);
}

interface Series {
  metric: string;
  type: number; // 3 = gauge
  points: { timestamp: number; value: number }[];
  tags: string[];
}

// Submit per-quest scores as a single gauge metric. The total is derived in the
// dashboard via sum by {dej_handle}. env and session tags are always included so
// the leaderboard dashboard can be sliced reliably; dej_module / dej_quest allow
// "which domain is the player strong in" analysis.
export async function reportPlayerScore(player: Player, sessionId: string): Promise<void> {
  const baseTags = [
    `env:${ENV}`,
    `dej_session:${sessionId}`,
    `dej_handle:${player.handle}`,
    `dej_email:${player.email}`,
  ];
  const now = Math.floor(Date.now() / 1000);

  const series: Series[] = Object.values(player.progress).map((progress) => {
    let moduleId = "unknown";
    try {
      moduleId = loadQuest(progress.questId).module;
    } catch {
      // Quest config missing; tag as unknown rather than dropping the point.
    }
    return {
      metric: "dej.score",
      type: 3,
      points: [{ timestamp: now, value: displayScore(progress) }],
      tags: [...baseTags, `dej_module:${moduleId}`, `dej_quest:${progress.questId}`],
    };
  });

  if (series.length === 0) return;

  if (!metricsEnabled()) {
    console.log(
      `[dej][test] would submit ${series.length} dej.score points for ${player.handle} (${player.email}) — set DEJ_SEND_METRICS=true to enable`,
    );
    return;
  }

  try {
    const res = await fetch(`${apiBase()}/api/v2/series`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": API_KEY as string,
      },
      body: JSON.stringify({ series }),
    });
    if (!res.ok) {
      console.error(`[dej] metric submit failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[dej] metric submit error", err);
  }
}

// Emit a point when a player confirms they logged into Datadog. Visualize on a
// QueryValue widget as `count_nonzero(sum:dej.player.logged_in{...} by {dej_handle})`
// (or unique dej_handle count) to show the host "N / M logged in" live.
export async function reportPlayerLoggedIn(
  player: Player,
  sessionId: string,
): Promise<void> {
  const series: Series[] = [
    {
      metric: "dej.player.logged_in",
      type: 3,
      points: [{ timestamp: Math.floor(Date.now() / 1000), value: 1 }],
      tags: [
        `env:${ENV}`,
        `dej_session:${sessionId}`,
        `dej_handle:${player.handle}`,
        `dej_email:${player.email}`,
      ],
    },
  ];

  if (!metricsEnabled()) {
    console.log(
      `[dej][test] would submit dej.player.logged_in for ${player.handle} (${player.email}) — set DEJ_SEND_METRICS=true to enable`,
    );
    return;
  }

  try {
    const res = await fetch(`${apiBase()}/api/v2/series`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": API_KEY as string,
      },
      body: JSON.stringify({ series }),
    });
    if (!res.ok) {
      console.error(`[dej] logged_in metric submit failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[dej] logged_in metric submit error", err);
  }
}

// Shared, read-only Datadog login shown to players in the lobby. Server-only:
// returned via an API route, never inlined into the browser bundle and never
// committed (lives in .env.local). Returns null when not configured.
export interface DatadogLogin {
  url: string;
  email: string;
  password: string;
}

export function getDatadogLogin(): DatadogLogin | null {
  const url = process.env.DEJ_DATADOG_LOGIN_URL;
  const email = process.env.DEJ_DATADOG_LOGIN_EMAIL;
  const password = process.env.DEJ_DATADOG_LOGIN_PASSWORD;
  if (!url || !email || !password) return null;
  return { url, email, password };
}

export interface ProvisionResult {
  provisioned: boolean;
  testMode: boolean;
  alreadyExists: boolean;
}

// Create a Datadog org user (idempotent). A 409 means the user already exists,
// which we treat as success. Returns whether the user is now provisioned.
export async function provisionDatadogUser(
  email: string,
  name: string,
): Promise<ProvisionResult> {
  if (!provisionEnabled()) {
    console.log(
      `[dej][test] would provision Datadog user ${email} (${name}) — set DEJ_PROVISION_USERS=true (+ DD_APP_KEY) to enable`,
    );
    return { provisioned: false, testMode: true, alreadyExists: false };
  }

  const body = {
    data: {
      type: "users",
      attributes: { email, name },
      ...(ROLE_ID
        ? { relationships: { roles: { data: [{ id: ROLE_ID, type: "roles" }] } } }
        : {}),
    },
  };

  try {
    const res = await fetch(`${apiBase()}/api/v2/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": API_KEY as string,
        "DD-APPLICATION-KEY": APP_KEY as string,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { provisioned: true, testMode: false, alreadyExists: false };
    }
    if (res.status === 409) {
      return { provisioned: true, testMode: false, alreadyExists: true };
    }
    console.error(`[dej] user provision failed: ${res.status} ${await res.text()}`);
    return { provisioned: false, testMode: false, alreadyExists: false };
  } catch (err) {
    console.error("[dej] user provision error", err);
    return { provisioned: false, testMode: false, alreadyExists: false };
  }
}
