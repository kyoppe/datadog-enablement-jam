// Local JSON file store for the MVP.
// Not concurrency-safe at scale, but fine for a hackathon demo.
// Swap this module for SQLite/D1/KV later without touching API routes much.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Session, Player } from "./types";

const DATA_DIR = join(process.cwd(), "data");
const DB_FILE = join(DATA_DIR, "store.json");

interface DB {
  sessions: Session[];
  players: Player[];
}

function emptyDB(): DB {
  return { sessions: [], players: [] };
}

function readDB(): DB {
  if (!existsSync(DB_FILE)) return emptyDB();
  try {
    const parsed = JSON.parse(readFileSync(DB_FILE, "utf8")) as Partial<DB>;
    return { sessions: parsed.sessions ?? [], players: parsed.players ?? [] };
  } catch {
    return emptyDB();
  }
}

function writeDB(db: DB): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

// --- Sessions --------------------------------------------------------------

// Backfill fields for sessions created before they existed.
function normalizeSession(s: Session): Session {
  const moduleIds = s.moduleIds ?? (s.module ? [s.module] : []);
  const status = s.status ?? "active";
  // Sessions created before phases existed: ended -> ended, otherwise treat as
  // already running so their behavior (quests visible) is preserved.
  const phase = s.phase ?? (status === "ended" ? "ended" : "running");
  return {
    ...s,
    moduleIds,
    module: s.module ?? moduleIds[0],
    status: phase === "ended" ? "ended" : "active",
    phase,
    startedAt: s.startedAt ?? null,
    endedAt: s.endedAt ?? null,
  };
}

export function createSession(session: Session): Session {
  const db = readDB();
  db.sessions.push(session);
  writeDB(db);
  return session;
}

export function getSession(id: string): Session | undefined {
  const s = readDB().sessions.find((x) => x.id === id);
  return s ? normalizeSession(s) : undefined;
}

export function listSessions(): Session[] {
  return readDB().sessions.map(normalizeSession);
}

// The single active session, if any. DEJ runs one active session at a time so
// the shared data plane is unambiguous.
export function getActiveSession(): Session | undefined {
  return listSessions().find((s) => s.status === "active");
}

// Start the problem: move a lobby session into the running phase so quests
// become visible to players. No-op (but still returns the session) if already
// running or ended.
export function startSession(id: string): Session | undefined {
  const db = readDB();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;
  const current = normalizeSession(db.sessions[idx]);
  if (current.phase === "lobby") {
    db.sessions[idx] = {
      ...current,
      phase: "running",
      status: "active",
      startedAt: new Date().toISOString(),
    };
    writeDB(db);
    return db.sessions[idx];
  }
  return current;
}

// Mark a session as ended. Players can no longer join or submit; the
// leaderboard stays readable (frozen).
export function endSession(id: string): Session | undefined {
  const db = readDB();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;
  db.sessions[idx] = {
    ...normalizeSession(db.sessions[idx]),
    status: "ended",
    phase: "ended",
    endedAt: new Date().toISOString(),
  };
  writeDB(db);
  return db.sessions[idx];
}

// Permanently delete a session and all of its players.
export function deleteSession(id: string): boolean {
  const db = readDB();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.id !== id);
  db.players = db.players.filter((p) => p.sessionId !== id);
  const removed = db.sessions.length < before;
  if (removed) writeDB(db);
  return removed;
}

// --- Players ---------------------------------------------------------------

// Backfill identity/progress for players. The display name is the identity.
// Legacy players (created when email/handle existed) fall back to handle/email.
function normalizePlayer(p: Player): Player {
  const legacy = p as Partial<Player> & { handle?: string; email?: string };
  const name = p.name || legacy.handle || legacy.email || "";
  return {
    id: p.id,
    sessionId: p.sessionId,
    name,
    joinedAt: p.joinedAt ?? new Date().toISOString(),
    loggedInAt: p.loggedInAt ?? null,
    finishedAt: p.finishedAt ?? null,
    progress: p.progress ?? {},
  };
}

export function listPlayers(sessionId: string): Player[] {
  return readDB()
    .players.filter((p) => p.sessionId === sessionId)
    .map(normalizePlayer);
}

export function getPlayer(sessionId: string, name: string): Player | undefined {
  const p = readDB().players.find(
    (x) => x.sessionId === sessionId && normalizePlayer(x).name === name,
  );
  return p ? normalizePlayer(p) : undefined;
}

export function getOrCreatePlayer(sessionId: string, name: string): Player {
  const db = readDB();
  const existing = db.players.find(
    (p) => p.sessionId === sessionId && normalizePlayer(p).name === name,
  );
  if (existing) return normalizePlayer(existing);
  const player: Player = {
    id: `${sessionId}:${name}`,
    sessionId,
    name,
    joinedAt: new Date().toISOString(),
    loggedInAt: null,
    finishedAt: null,
    progress: {},
  };
  db.players.push(player);
  writeDB(db);
  return player;
}

// Record that a player confirmed they logged into Datadog. Idempotent: the
// first confirmation timestamp is kept. Returns the player, or undefined if not
// found.
export function markPlayerLoggedIn(
  sessionId: string,
  name: string,
): Player | undefined {
  const db = readDB();
  const idx = db.players.findIndex(
    (p) => p.sessionId === sessionId && normalizePlayer(p).name === name,
  );
  if (idx < 0) return undefined;
  const player = normalizePlayer(db.players[idx]);
  if (!player.loggedInAt) {
    player.loggedInAt = new Date().toISOString();
    db.players[idx] = player;
    writeDB(db);
  }
  return player;
}

// Record that a player declared they are done ("回答を終了"). Idempotent: the
// first finish timestamp is kept. Returns the player, or undefined if not found.
export function markPlayerFinished(
  sessionId: string,
  name: string,
): Player | undefined {
  const db = readDB();
  const idx = db.players.findIndex(
    (p) => p.sessionId === sessionId && normalizePlayer(p).name === name,
  );
  if (idx < 0) return undefined;
  const player = normalizePlayer(db.players[idx]);
  if (!player.finishedAt) {
    player.finishedAt = new Date().toISOString();
    db.players[idx] = player;
    writeDB(db);
  }
  return player;
}

// Lobby headcount for the admin page: total registered vs. logged-in players.
export function loginStats(sessionId: string): {
  total: number;
  loggedIn: number;
} {
  const players = listPlayers(sessionId);
  return {
    total: players.length,
    loggedIn: players.filter((p) => p.loggedInAt).length,
  };
}

export function updatePlayer(updated: Player): Player {
  const db = readDB();
  const idx = db.players.findIndex((p) => p.id === updated.id);
  if (idx >= 0) db.players[idx] = updated;
  else db.players.push(updated);
  writeDB(db);
  return updated;
}
