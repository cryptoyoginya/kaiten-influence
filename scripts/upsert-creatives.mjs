// Точечно заливает data.creatives одного размещения в Supabase, НЕ затирая
// остальные данные (в отличие от seed.mjs, который truncate-ит таблицы и не
// пишет колонку data вовсе).
//
// Источник истины — data/sprints.json. Скрипт берёт оттуда placement.data.creatives
// и мёржит в jsonb-колонку placements.data по (sprint_id, name). Идемпотентно.
//
// Запуск:
//   node --env-file=.env.local scripts/upsert-creatives.mjs "Пименов вещает" week-1
//   node --env-file=.env.local scripts/upsert-creatives.mjs           # все размещения с creatives
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const conn = process.env.DATABASE_URL;
if (!conn || conn.includes("<PASSWORD>")) {
  console.error("✗ Нет DATABASE_URL (или пароль не подставлен) в .env.local.");
  process.exit(1);
}

const onlyName = process.argv[2] || null;
const onlySprint = process.argv[3] || null;

const sprints = JSON.parse(readFileSync(join(ROOT, "data", "sprints.json"), "utf-8"));
const targets = [];
for (const s of sprints) {
  for (const p of s.placements ?? []) {
    const creatives = p.data?.creatives;
    if (!creatives?.length) continue;
    if (onlyName && p.name !== onlyName) continue;
    if (onlySprint && s.id !== onlySprint) continue;
    targets.push({ sprint_id: s.id, name: p.name, creatives });
  }
}

if (targets.length === 0) {
  console.error("✗ Нечего заливать: не найдено размещений с data.creatives" +
    (onlyName ? ` по имени «${onlyName}»` : ""));
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  for (const t of targets) {
    // мёрж: меняем только ключ creatives, остальные поля data сохраняются
    const res = await client.query(
      `update placements
          set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('creatives', $1::jsonb)
        where sprint_id = $2 and name = $3`,
      [JSON.stringify(t.creatives), t.sprint_id, t.name]
    );
    if (res.rowCount === 0) {
      console.warn(`⚠ не найдено размещение в БД: ${t.sprint_id} / ${t.name}`);
    } else {
      console.log(`✓ ${t.sprint_id} / ${t.name}: залито вариантов ${t.creatives.length} (строк обновлено ${res.rowCount})`);
    }
  }
  console.log("\nГотово. Остальные поля карточек не тронуты.");
}

main()
  .catch((e) => {
    console.error("✗ Ошибка:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
