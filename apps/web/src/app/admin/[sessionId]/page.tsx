import AdminConsoleClient from "./AdminConsoleClient";

export default async function AdminConsolePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AdminConsoleClient sessionId={sessionId} />;
}
