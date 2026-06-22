import { fetchIntegrations } from "@/lib/db";
import ResultsClient from "./ResultsClient";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const seed = await fetchIntegrations();
  return <ResultsClient seed={seed} />;
}
