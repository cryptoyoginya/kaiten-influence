import { getSprints } from "@/lib/data";
import SprintView from "./SprintView";

export default function SprintPage() {
  const sprint = getSprints().find((s) => s.status === "active") ?? getSprints()[0];
  return <SprintView sprint={sprint} />;
}
