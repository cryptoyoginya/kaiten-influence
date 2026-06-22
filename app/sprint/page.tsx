import { fetchSprints } from "@/lib/db";
import SprintBoard from "./SprintBoard";

export const dynamic = "force-dynamic";

export default async function SprintPage() {
  const sprints = await fetchSprints();
  const sprint = sprints.find((s) => s.status === "active") ?? sprints[0];
  return <SprintBoard sprint={sprint} />;
}
