import LeaderboardClient from "./LeaderboardClient";

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <LeaderboardClient sessionId={sessionId} />;
}
