import { fetchSprints } from "@/lib/db";
import SprintBoard from "./SprintBoard";

export const dynamic = "force-dynamic";

export default async function SprintPage() {
  const sprints = await fetchSprints();
  // недели по возрастанию даты
  sprints.sort((a, b) => (a.date_from > b.date_from ? 1 : -1));
  return <SprintBoard sprints={sprints} />;
}
