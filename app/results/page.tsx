import { getIntegrations } from "@/lib/data";
import ResultsClient from "./ResultsClient";

export default function ResultsPage() {
  const seed = getIntegrations();
  return <ResultsClient seed={seed} />;
}
