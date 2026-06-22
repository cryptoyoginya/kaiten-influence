// Заливка data/*.json в Supabase по DATABASE_URL (идемпотентно: чистит и наливает).
// Запуск: node --env-file=.env.local supabase/seed.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const conn = process.env.DATABASE_URL;

if (!conn || conn.includes("<PASSWORD>")) {
  console.error(
    "✗ Нет DATABASE_URL (или не подставлен пароль) в .env.local.\n" +
      "  Раскомментируй строку DATABASE_URL и впиши пароль БД."
  );
  process.exit(1);
}

const read = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf-8"));
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function main() {
  const channels = read("channels.json");
  const sprints = read("sprints.json");
  const integrations = read("integrations.json");

  await client.connect();
  await client.query("begin");
  // чистим контентные таблицы (профили/аудит не трогаем)
  await client.query(
    "truncate integrations, placements, sprints, channels restart identity cascade"
  );

  // channels
  for (const c of channels) {
    await client.query(
      `insert into channels
        (name, link, niches, subscribers, audience, themes, err_views,
         price_raw, referral, comments, draft, shortlisted,
         post_date, post_topic, offer, creative, landing, utm)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        c.name, c.link || null, c.niches ?? [], c.subscribers ?? "", c.audience ?? "",
        c.themes ?? "", c.err_views ?? "", c.price_raw ?? "", c.referral ?? "",
        c.comments ?? [], !!c.draft, !!c.shortlisted, c.post_date ?? "",
        c.post_topic ?? "", c.offer ?? "", c.creative ?? "", c.landing ?? "", c.utm ?? "",
      ]
    );
  }
  console.log(`✓ channels: ${channels.length}`);

  // sprints + placements
  let plCount = 0;
  for (const s of sprints) {
    await client.query(
      `insert into sprints (id, title, date_from, date_to, status)
       values ($1,$2,$3,$4,$5)`,
      [s.id, s.title, s.date_from, s.date_to, s.status]
    );
    for (const p of s.placements ?? []) {
      await client.query(
        `insert into placements
          (sprint_id, name, author_desc, audience, post_date, post_topic, offer,
           creative, landing, utm, price, price_discount, subscribers, avg_views,
           err, forecast_reach, forecast_cpv, steps)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          s.id, p.name, p.author_desc ?? "", p.audience ?? "", p.post_date ?? "",
          p.post_topic ?? "", p.offer ?? "", p.creative ?? "", p.landing ?? "",
          p.utm ?? "", p.price ?? "", p.price_discount ?? "", p.subscribers ?? "",
          p.avg_views ?? "", p.err ?? "", p.forecast_reach ?? "", p.forecast_cpv ?? "",
          JSON.stringify(p.steps ?? {}),
        ]
      );
      plCount++;
    }
  }
  console.log(`✓ sprints: ${sprints.length}, placements: ${plCount}`);

  // integrations
  for (const i of integrations) {
    await client.query(
      `insert into integrations
        (id, sprint_id, name, niche, date, landing, published, plan, result)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        i.id, i.sprint_id, i.name, i.niche ?? "", i.date ?? "", i.landing ?? "",
        !!i.published, JSON.stringify(i.plan ?? {}), JSON.stringify(i.result ?? {}),
      ]
    );
  }
  console.log(`✓ integrations: ${integrations.length}`);

  await client.query("commit");
  console.log("\nГотово. Данные в Supabase.");
}

main()
  .catch(async (e) => {
    try {
      await client.query("rollback");
    } catch {}
    console.error("✗ Ошибка:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
