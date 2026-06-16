"use client";

import { useEffect, useState } from "react";
import { ja } from "@/i18n/ja";
import LeaderboardTable from "@/components/LeaderboardTable";

interface Session {
  id: string;
  name: string;
  moduleIds: string[];
  module?: string;
  createdAt: string;
  status: "active" | "ended";
  endedAt: string | null;
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

  useEffect(() => {
    setOrigin(window.location.origin);
    loadModules();
    loadSessions();
  }, []);

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

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
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
          const command = `make scenario SESSION=${s.id}`;
          const ended = s.status === "ended";
          const moduleNames = (s.moduleIds ?? []).map(moduleTitle).join(", ");
          return (
            <div className="panel" key={s.id}>
              <p>
                <strong>{s.name}</strong>{" "}
                <span className="mono">({s.id})</span>{" "}
                <span className={`badge ${ended ? "pending" : "ok"}`}>
                  {ended ? ja.admin.statusEnded : ja.admin.statusActive}
                </span>
              </p>
              <p className="muted" style={{ marginTop: 0 }}>
                {ja.admin.targetModules}: {moduleNames || "-"} ·{" "}
                {ja.admin.createdAt}: {formatTime(s.createdAt)}
                {ended && s.endedAt && ` · ${ja.admin.endedAt}: ${formatTime(s.endedAt)}`}
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {!ended && (
                  <button className="secondary" onClick={() => endSession(s.id)}>
                    {ja.admin.endSession}
                  </button>
                )}
                <button className="danger" onClick={() => deleteSession(s.id)}>
                  {ja.admin.deleteSession}
                </button>
              </div>

              <div className="command-block">
                <code>{command}</code>
                <button className="secondary" onClick={() => copy(`cmd-${s.id}`, command)}>
                  {copiedKey === `cmd-${s.id}` ? ja.admin.copied : ja.admin.copy}
                </button>
              </div>

              {ended && (
                <>
                  <p className="muted" style={{ marginBottom: 4 }}>
                    {ja.admin.stopDataPlaneHint}
                  </p>
                  <div className="command-block">
                    <code>make stop</code>
                    <button
                      className="secondary"
                      onClick={() => copy(`stop-${s.id}`, "make stop")}
                    >
                      {copiedKey === `stop-${s.id}` ? ja.admin.copied : ja.admin.copy}
                    </button>
                  </div>
                </>
              )}

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
