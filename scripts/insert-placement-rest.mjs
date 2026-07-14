// Создаёт НОВОЕ размещение в Supabase через REST (PostgREST), если его ещё нет.
// upsert-creatives-rest.mjs только обновляет существующую строку — этот скрипт
// вставляет новую (name+sprint_id), со всеми полями и data.creatives из sprints.json.
// Нужен service_role ключ (обходит RLS). Идемпотентно: если строка есть — не дублирует.
//
// Запуск:
//   SUPABASE_URL='https://xxxxx.supabase.co' \
//   SUPABASE_SERVICE_ROLE='eyJ...' \
//   node scripts/insert-placement-rest.mjs "HR аналитика" week-1
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
const name = process.argv[2];
const sprintId = process.argv[3];
if (!name || !sprintId) {
  console.error('✗ Использование: node scripts/insert-placement-rest.mjs "<имя>" <sprint_id>');
  process.exit(1);
}

const sprints = JSON.parse(readFileSync(join(ROOT, "data", "sprints.json"), "utf-8"));
const sprint = sprints.find((s) => s.id === sprintId);
const p = sprint?.placements?.find((x) => x.name === name);
if (!p) { console.error(`✗ Не найдено в sprints.json: ${sprintId} / ${name}`); process.exit(1); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = `${URL_BASE.replace(/\/$/, "")}/rest/v1/placements`;

const row = {
  sprint_id: sprintId,
  name: p.name,
  author_desc: p.author_desc ?? "", audience: p.audience ?? "", post_date: p.post_date ?? "",
  post_topic: p.post_topic ?? "", offer: p.offer ?? "", creative: p.creative ?? "",
  landing: p.landing ?? "", utm: p.utm ?? "", price: p.price ?? "", price_discount: p.price_discount ?? "",
  subscribers: p.subscribers ?? "", avg_views: p.avg_views ?? "", err: p.err ?? "",
  forecast_reach: p.forecast_reach ?? "", forecast_cpv: p.forecast_cpv ?? "",
  steps: p.steps ?? {}, data: p.data ?? {}, updated_at: new Date().toISOString(),
};

async function main() {
  const q = new URLSearchParams({ sprint_id: `eq.${sprintId}`, name: `eq.${name}`, select: "id" });
  const check = await fetch(`${rest}?${q}`, { headers });
  if (!check.ok) throw new Error(`GET ${check.status}: ${await check.text()}`);
  const existing = await check.json();
  if (existing.length > 0) {
    console.log(`⚠ Уже есть в БД (${existing.length}). Обновляю data.creatives через PATCH.`);
    const patch = await fetch(`${rest}?${q}`, {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ data: row.data, updated_at: row.updated_at }),
    });
    if (!patch.ok) throw new Error(`PATCH ${patch.status}: ${await patch.text()}`);
    console.log(`✓ Обновлено. Креативов: ${(row.data.creatives || []).length}`);
    return;
  }
  const ins = await fetch(rest, {
    method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(row),
  });
  if (!ins.ok) throw new Error(`POST ${ins.status}: ${await ins.text()}`);
  const created = await ins.json();
  console.log(`✓ Создано размещение «${name}» в ${sprintId}. id=${created[0]?.id}, креативов: ${(row.data.creatives || []).length}`);
}
main().catch((e) => { console.error("✗ Ошибка:", e.message ?? e); process.exitCode = 1; });
