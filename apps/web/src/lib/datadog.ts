// Datadog frontend observability (RUM + Browser Logs + Session Replay).
//
// Client-side only. Credentials come from NEXT_PUBLIC_* env vars so they are
// inlined into the browser bundle at build time. The RUM client token is a
// public, embeddable token (not the org API key).

import { datadogRum } from "@datadog/browser-rum";
import { datadogLogs } from "@datadog/browser-logs";

let initialized = false;

function readConfig() {
  const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID;
  const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN;
  const site = process.env.NEXT_PUBLIC_DD_SITE || "datadoghq.com";
  const env = process.env.NEXT_PUBLIC_DD_ENV || "dej";
  const service = process.env.NEXT_PUBLIC_DD_SERVICE || "dej-web";
  const version = process.env.NEXT_PUBLIC_DD_VERSION || "dev";
  return { applicationId, clientToken, site, env, service, version };
}

export function initDatadog(): void {
  if (initialized || typeof window === "undefined") return;

  const { applicationId, clientToken, site, env, service, version } = readConfig();

  // Without app id + client token there is nothing to initialize (e.g. local
  // builds where the RUM app has not been provisioned yet).
  if (!applicationId || !clientToken) {
    return;
  }

  datadogRum.init({
    applicationId,
    clientToken,
    site,
    service,
    env,
    version,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
    // Correlate browser resource calls to the control-plane API traces.
    allowedTracingUrls: [
      (url) => typeof window !== "undefined" && url.startsWith(window.location.origin),
    ],
  });
  datadogRum.startSessionReplayRecording();

  datadogLogs.init({
    clientToken,
    site,
    service,
    env,
    version,
    forwardErrorsToLogs: true,
    forwardConsoleLogs: "all",
    sessionSampleRate: 100,
    // Every browser log must carry a stable, facet-friendly event_type.
    beforeSend: (log) => {
      const l = log as Record<string, unknown>;
      if (!l.event_type) {
        l.event_type = l.origin ? `browser_${String(l.origin)}` : "browser_log";
      }
      return true;
    },
  });

  initialized = true;
}

export interface GameContext {
  sessionId: string;
  // Stable identity (email) used as the RUM user id and dej_email tag.
  email?: string;
  // Anonymous public handle.
  handle?: string;
  module?: string;
  scenario?: string;
}

// Attach DEJ game identifiers so RUM sessions / logs can be sliced by
// session and player, mirroring the data-plane dej_* APM tags.
export function setGameContext(ctx: GameContext): void {
  if (typeof window === "undefined") return;

  datadogRum.setGlobalContextProperty("dej_session", ctx.sessionId);
  if (ctx.module) datadogRum.setGlobalContextProperty("dej_module", ctx.module);
  if (ctx.scenario) datadogRum.setGlobalContextProperty("dej_scenario", ctx.scenario);
  if (ctx.handle) datadogRum.setGlobalContextProperty("dej_handle", ctx.handle);
  if (ctx.email) datadogRum.setGlobalContextProperty("dej_email", ctx.email);

  if (ctx.email || ctx.handle) {
    datadogRum.setUser({ id: ctx.email ?? ctx.handle, name: ctx.handle });
  }

  datadogLogs.setGlobalContextProperty("dej_session", ctx.sessionId);
  if (ctx.handle) datadogLogs.setGlobalContextProperty("dej_handle", ctx.handle);
  if (ctx.email) datadogLogs.setGlobalContextProperty("dej_email", ctx.email);
}
