// Заливка data/*.json в Supabase. Запуск: node supabase/seed.mjs
// Нужны переменные окружения (из .env.local):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "✗ Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Заполни .env.local и запусти:  node --env-file=.env.local supabase/seed.mjs"
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const read = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf-8"));

async function main() {
  const channels = read("channels.json");
  const sprints = read("sprints.json");
  const integrations = read("integrations.json");

  // channels
  {
    const rows = channels.map((c) => ({
      name: c.name,
      link: c.link || null,
      niches: c.niches ?? [],
      subscribers: c.subscribers ?? "",
      audience: c.audience ?? "",
      themes: c.themes ?? "",
      err_views: c.err_views ?? "",
      price_raw: c.price_raw ?? "",
      referral: c.referral ?? "",
      comments: c.comments ?? [],
      draft: !!c.draft,
      shortlisted: !!c.shortlisted,
      post_date: c.post_date ?? "",
      post_topic: c.post_topic ?? "",
      offer: c.offer ?? "",
      creative: c.creative ?? "",
      landing: c.landing ?? "",
      utm: c.utm ?? "",
    }));
    const { error } = await db.from("channels").insert(rows);
    if (error) throw error;
    console.log(`✓ channels: ${rows.length}`);
  }

  // sprints + placements
  for (const s of sprints) {
    const { error: se } = await db
      .from("sprints")
      .upsert({
        id: s.id,
        title: s.title,
        date_from: s.date_from,
        date_to: s.date_to,
        status: s.status,
      });
    if (se) throw se;

    const rows = (s.placements ?? []).map((p) => ({
      sprint_id: s.id,
      name: p.name,
      author_desc: p.author_desc ?? "",
      audience: p.audience ?? "",
      post_date: p.post_date ?? "",
      post_topic: p.post_topic ?? "",
      offer: p.offer ?? "",
      creative: p.creative ?? "",
      landing: p.landing ?? "",
      utm: p.utm ?? "",
      price: p.price ?? "",
      price_discount: p.price_discount ?? "",
      subscribers: p.subscribers ?? "",
      avg_views: p.avg_views ?? "",
      err: p.err ?? "",
      forecast_reach: p.forecast_reach ?? "",
      forecast_cpv: p.forecast_cpv ?? "",
      steps: p.steps ?? {},
    }));
    if (rows.length) {
      const { error } = await db.from("placements").insert(rows);
      if (error) throw error;
    }
    console.log(`✓ sprint ${s.id}: ${rows.length} placements`);
  }

  // integrations
  {
    const rows = integrations.map((i) => ({
      id: i.id,
      sprint_id: i.sprint_id,
      name: i.name,
      niche: i.niche ?? "",
      date: i.date ?? "",
      landing: i.landing ?? "",
      published: !!i.published,
      plan: i.plan ?? {},
      result: i.result ?? {},
    }));
    const { error } = await db.from("integrations").upsert(rows);
    if (error) throw error;
    console.log(`✓ integrations: ${rows.length}`);
  }

  console.log("\nГотово. Данные в Supabase.");
}

main().catch((e) => {
  console.error("✗ Ошибка:", e.message ?? e);
  process.exit(1);
});
