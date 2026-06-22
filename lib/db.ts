import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/server";
import {
  getChannels as jsonChannels,
  getSprints as jsonSprints,
  getIntegrations as jsonIntegrations,
  type Channel,
  type Sprint,
  type Integration,
} from "@/lib/data";

// Чтение данных: из Supabase (если подключён) либо из data/*.json (фолбэк).

export async function fetchChannels(): Promise<Channel[]> {
  if (!SUPABASE_ENABLED) return jsonChannels();
  const s = await createClient();
  const { data, error } = await s.from("channels").select("*").order("name");
  if (error || !data) return jsonChannels();
  return data as Channel[];
}

export async function fetchSprints(): Promise<Sprint[]> {
  if (!SUPABASE_ENABLED) return jsonSprints();
  const s = await createClient();
  const { data: sprints } = await s.from("sprints").select("*");
  const { data: placements } = await s.from("placements").select("*");
  if (!sprints) return jsonSprints();
  return sprints.map((sp) => ({
    ...(sp as Omit<Sprint, "placements">),
    placements: (placements ?? []).filter((p: { sprint_id: string }) => p.sprint_id === sp.id),
  })) as Sprint[];
}

export async function fetchIntegrations(): Promise<Integration[]> {
  if (!SUPABASE_ENABLED) return jsonIntegrations();
  const s = await createClient();
  const { data, error } = await s.from("integrations").select("*").order("name");
  if (error || !data) return jsonIntegrations();
  return data as Integration[];
}
