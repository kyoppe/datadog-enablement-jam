"use client";

import { useEffect, useState } from "react";
import { ja } from "@/i18n/ja";
import LeaderboardTable from "@/components/LeaderboardTable";
import { copyText } from "@/lib/clipboard";

type SessionPhase = "lobby" | "running" | "ended";

interface Session {
  id: string;
  name: string;
  moduleIds: string[];
  module?: string;
  createdAt: string;
  status: "active" | "ended";
  phase: SessionPhase;
  startedAt: string | null;
  endedAt: string | null;
}

interface LoginStat {
  total: number;
  loggedIn: number;
}

interface ModuleSummary {
  id: string;
  display_title: string;
  quests: string[];
}

export default function AdminPage() {
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [logins, setLogins] = useState<Record<string, LoginStat>>({});

  useEffect(() => {
    setOrigin(window.location.origin);
    loadModules();
    loadSessions();
  }, []);

  // Poll login headcount for the live (non-ended) session so the host can see
  // "N / M logged in" before pressing 問題スタート.
  useEffect(() => {
    const live = sessions.filter((s) => s.phase !== "ended").map((s) => s.id);
    if (live.length === 0) return;
    const fetchStats = () => {
      live.forEach(async (id) => {
        try {
          const res = await fetch(`/api/sessions/${id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.login) setLogins((prev) => ({ ...prev, [id]: data.login }));
        } catch {
          // Ignore transient errors; retried on the next tick.
        }
      });
    };
    fetchStats();
    const timer = setInterval(fetchStats, 5000);
    return () => clearInterval(timer);
  }, [sessions]);

  const hasActive = sessions.some((s) => s.status === "active");
  const moduleTitle = (id: string) =>
    modules.find((m) => m.id === id)?.display_title ?? id;

  async function loadModules() {
    try {
      const res = await fetch("/api/modules");
      const data = await res.json();
      const list = (data.modules ?? []) as ModuleSummary[];
      setModules(list);
      // Default-select the first module.
      setSelectedModules(list.length > 0 ? [list[0].id] : []);
    } catch {
      // Ignore; the picker will be empty and creation falls back server-side.
    }
  }

  async function loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const list = (data.sessions ?? []) as Session[];
      setSessions([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch {
      // Ignore; user can retry by creating/refreshing.
    }
  }

  function toggleModule(id: string) {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  async function createSession() {
    setCreateError(null);
    if (selectedModules.length === 0) {
      setCreateError(ja.admin.moduleRequired);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, moduleIds: selectedModules }),
      });
      if (res.status === 409) {
        setCreateError(ja.admin.activeSessionExists);
        await loadSessions();
        return;
      }
      setName("");
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: string, text: string) {
    await copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function startProblem(id: string) {
    if (!window.confirm(ja.admin.confirmStart)) return;
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    await loadSessions();
  }

  async function endSession(id: string) {
    if (!window.confirm(ja.admin.confirmEnd)) return;
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    await loadSessions();
  }

  async function deleteSession(id: string) {
    if (!window.confirm(ja.admin.confirmDelete)) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    await loadSessions();
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("ja-JP");
  }

  return (
    <main>
      <h1>{ja.admin.heading}</h1>
      <p className="subheading">{ja.admin.subheading}</p>

      <div className="panel">
        <h3>{ja.admin.createHeading}</h3>
        {hasActive ? (
          <p className="muted">{ja.admin.activeSessionExists}</p>
        ) : (
          <>
            <label htmlFor="sessionName">{ja.admin.sessionName}</label>
            <input
              id="sessionName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 2026-06-15 APM ハンズオン"
            />

            <label>{ja.admin.selectModules}</label>
            <p className="muted" style={{ marginTop: 0 }}>
              {ja.admin.selectModulesHint}
            </p>
            {modules.length === 0 ? (
              <p className="muted">{ja.admin.noModules}</p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {modules.map((m) => (
                  <label
                    key={m.id}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                    />
                    <span>
                      {m.display_title}{" "}
                      <span className="muted">({m.quests.length} quests)</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button onClick={createSession} disabled={loading}>
              {loading ? ja.common.loading : ja.admin.createSession}
            </button>
            {createError && <p className="muted">{createError}</p>}
          </>
        )}
      </div>

      <h3>{ja.admin.sessionsHeading}</h3>
      {sessions.length === 0 ? (
        <p className="muted">{ja.admin.noSessions}</p>
      ) : (
        sessions.map((s) => {
          const playerUrl = `${origin}/play/${s.id}`;
          const leaderboardUrl = `${origin}/leaderboard/${s.id}`;
          const ended = s.status === "ended";
          const phase = s.phase ?? (ended ? "ended" : "running");
          const moduleNames = (s.moduleIds ?? []).map(moduleTitle).join(", ");
          const stat = logins[s.id];
          const phaseBadge =
            phase === "ended"
              ? { cls: "pending", label: ja.admin.statusEnded }
              : phase === "lobby"
                ? { cls: "warn", label: ja.admin.statusLobby }
                : { cls: "ok", label: ja.admin.statusRunning };
          return (
            <div className="panel" key={s.id}>
              <p>
                <strong>{s.name}</strong>{" "}
                <span className="mono">({s.id})</span>{" "}
                <span className={`badge ${phaseBadge.cls}`}>{phaseBadge.label}</span>
              </p>
              <dl className="meta-grid">
                <div>
                  <dt>{ja.admin.targetModules}</dt>
                  <dd>{moduleNames || "-"}</dd>
                </div>
                <div>
                  <dt>{ja.admin.createdAt}</dt>
                  <dd>{formatTime(s.createdAt)}</dd>
                </div>
                {s.startedAt && (
                  <div>
                    <dt>{ja.admin.startedAt}</dt>
                    <dd>{formatTime(s.startedAt)}</dd>
                  </div>
                )}
                {ended && s.endedAt && (
                  <div>
                    <dt>{ja.admin.endedAt}</dt>
                    <dd>{formatTime(s.endedAt)}</dd>
                  </div>
                )}
              </dl>

              {phase !== "ended" &&
                (() => {
                  const loggedIn = stat ? stat.loggedIn : 0;
                  const total = stat ? stat.total : 0;
                  const pct = total > 0 ? Math.round((loggedIn / total) * 100) : 0;
                  return (
                    <div className="login-meter">
                      <div className="login-meter-head">
                        <span className="login-meter-label">
                          {ja.admin.loginProgress}
                        </span>
                        <span className="login-meter-count">
                          {loggedIn} / {total}
                          <span className="unit">{ja.admin.loginCountUnit}</span>
                        </span>
                      </div>
                      <div
                        className="meter"
                        role="progressbar"
                        aria-valuenow={loggedIn}
                        aria-valuemin={0}
                        aria-valuemax={total}
                      >
                        <div className="meter-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {phase === "lobby" && (
                  <button onClick={() => startProblem(s.id)}>
                    {ja.admin.startProblem}
                  </button>
                )}
                {!ended && (
                  <button className="secondary" onClick={() => endSession(s.id)}>
                    {ja.admin.endSession}
                  </button>
                )}
                <button className="danger" onClick={() => deleteSession(s.id)}>
                  {ja.admin.deleteSession}
                </button>
              </div>

              <p style={{ marginTop: 16 }}>
                <strong>{ja.admin.playerUrl}:</strong>{" "}
                <a href={playerUrl}>{ja.admin.openPlayer}</a>{" "}
                <button
                  className="secondary"
                  onClick={() => copy(`play-${s.id}`, playerUrl)}
                >
                  {copiedKey === `play-${s.id}` ? ja.admin.copied : ja.admin.copy}
                </button>
              </p>
              <p>
                <strong>{ja.admin.leaderboardUrl}:</strong>{" "}
                <a href={leaderboardUrl}>{ja.admin.openLeaderboard}</a>
              </p>

              <h4>{ja.admin.leaderboardHeading}</h4>
              <LeaderboardTable sessionId={s.id} />
            </div>
          );
        })
      )}
    </main>
  );
}
