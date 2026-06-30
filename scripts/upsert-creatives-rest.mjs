// Точечно заливает data.creatives одного размещения в Supabase через REST
// (PostgREST), без пароля БД. Нужны только Project URL + service_role ключ.
// service_role обходит RLS, поэтому update проходит.
//
// Берёт creatives из data/sprints.json, читает текущую data строки, мёржит
// только ключ creatives и пишет обратно. Идемпотентно, остальные поля целы.
//
// Запуск:
//   SUPABASE_URL='https://xxxxx.supabase.co' \
//   SUPABASE_SERVICE_ROLE='eyJ...' \
//   node scripts/upsert-creatives-rest.mjs "Пименов вещает" week-1
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("✗ Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE в окружении.");
  process.exit(1);
}

const onlyName = process.argv[2] || null;
const onlySprint = process.argv[3] || null;

const sprints = JSON.parse(readFileSync(join(ROOT, "data", "sprints.json"), "utf-8"));
const targets = [];
for (const s of sprints) {
  for (const p of s.placements ?? []) {
    if (!p.data?.creatives?.length) continue;
    if (onlyName && p.name !== onlyName) continue;
    if (onlySprint && s.id !== onlySprint) continue;
    targets.push({ sprint_id: s.id, name: p.name, creatives: p.data.creatives });
  }
}
if (targets.length === 0) {
  console.error("✗ Нечего заливать: нет размещений с data.creatives" + (onlyName ? ` по имени «${onlyName}»` : ""));
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};
const rest = `${URL_BASE.replace(/\/$/, "")}/rest/v1/placements`;

async function main() {
  for (const t of targets) {
    const q = new URLSearchParams({
      sprint_id: `eq.${t.sprint_id}`,
      name: `eq.${t.name}`,
      select: "id,data",
    });
    const getRes = await fetch(`${rest}?${q}`, { headers });
    if (!getRes.ok) throw new Error(`GET ${getRes.status}: ${await getRes.text()}`);
    const rows = await getRes.json();
    if (rows.length === 0) {
      console.warn(`⚠ не найдено в БД: ${t.sprint_id} / ${t.name}`);
      continue;
    }
    if (rows.length > 1) {
      console.warn(`⚠ найдено ${rows.length} строк по ${t.sprint_id} / ${t.name}, обновляю все`);
    }
    const mergedData = { ...(rows[0].data ?? {}), creatives: t.creatives };
    const patchRes = await fetch(`${rest}?${q}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ data: mergedData }),
    });
    if (!patchRes.ok) throw new Error(`PATCH ${patchRes.status}: ${await patchRes.text()}`);
    const updated = await patchRes.json();
    console.log(`✓ ${t.sprint_id} / ${t.name}: вариантов ${t.creatives.length}, строк обновлено ${updated.length}`);
  }
  console.log("\nГотово. Остальные поля карточек не тронуты.");
}

main().catch((e) => {
  console.error("✗ Ошибка:", e.message ?? e);
  process.exitCode = 1;
});
