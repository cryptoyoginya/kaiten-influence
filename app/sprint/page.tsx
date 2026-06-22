import { fetchSprints } from "@/lib/db";
import SprintView from "./SprintView";

export const dynamic = "force-dynamic";

export default async function SprintPage() {
  const sprints = await fetchSprints();
  const sprint = sprints.find((s) => s.status === "active") ?? sprints[0];
  return <SprintView sprint={sprint} />;
}
