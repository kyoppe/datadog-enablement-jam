// DEJ Datadog dashboard link. The session id is injected as the dashboard's
// `dej_session` template variable so the board scopes to the active session.
// The base URL is env-overridable for the future Org move (kyouhei -> dej).
const DASHBOARD_BASE =
  process.env.NEXT_PUBLIC_DEJ_DASHBOARD_URL ??
  "https://kyouhei.datadoghq.com/dashboard/hbs-c33-i4p";

export function dejDashboardUrl(sessionId: string): string {
  const url = new URL(DASHBOARD_BASE);
  url.searchParams.set("tpl_var_dej_session[0]", sessionId);
  url.searchParams.set("live", "true");
  return url.toString();
}
