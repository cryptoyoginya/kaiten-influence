// Заливает data.creatives[] карточки НАПРЯМУЮ в Supabase из JSON-файла сета.
//
// Зачем, если есть upsert-creatives-rest.mjs: тот читает креативы из data/sprints.json,
// а сид отстаёт от базы (в нём живёт только week-1). Карточку из свежего спринта им
// залить нечем. Истина — в placements, поэтому этот скрипт берёт тексты из файла сета
// `content/channels/<slug>/sets/<set>/creatives.json` и пишет по имени или id карточки.
// Тот же контракт, что у append-creative-images.mjs (оно ставит картинки, это — тексты).
//
// Запуск:
//   node scripts/upsert-creatives-direct.mjs "<имя или id карточки>" <путь-к-creatives.json>
//   node scripts/upsert-creatives-direct.mjs 14ddc8d4-... content/channels/x/sets/y/creatives.json --dry
//
// Мёржит по слотам: текст/скоринг обновляются, уже проставленные image/images слота
// сохраняются. Идемпотентно. --dry печатает, что будет сделано, и ничего не пишет.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(join(ROOT, ".env.local"));
} catch {}

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) {
  console.error("✗ Нет SUPABASE_URL/ключа ни в окружении, ни в .env.local");
  process.exit(1);
}

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const [card, file] = argv.filter((a) => a !== "--dry");
if (!card || !file) {
  console.error('Использование: node scripts/upsert-creatives-direct.mjs "<имя или id>" <creatives.json> [--dry]');
  process.exit(1);
}
const path = resolve(file);
if (!existsSync(path)) {
  console.error(`✗ Нет файла сета: ${path}`);
  process.exit(1);
}

const incoming = JSON.parse(readFileSync(path, "utf-8"));
if (!Array.isArray(incoming) || incoming.length === 0) {
  console.error("✗ creatives.json должен быть непустым массивом слотов");
  process.exit(1);
}
for (const [i, c] of incoming.entries()) {
  if (!c || typeof c.text !== "string" || !c.text.trim()) {
    console.error(`✗ слот #${i}: нет непустого поля text`);
    process.exit(1);
  }
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = `${URL_BASE.replace(/\/$/, "")}/rest/v1/placements`;
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card);
const filter = isUuid ? `id=eq.${card}` : `name=eq.${encodeURIComponent(card)}`;

const getRes = await fetch(`${rest}?${filter}&select=id,sprint_id,name,data`, { headers });
if (!getRes.ok) throw new Error(`GET ${getRes.status}: ${await getRes.text()}`);
const rows = await getRes.json();
if (rows.length === 0) {
  console.error(`✗ Карточка не найдена в базе: ${card}`);
  process.exit(1);
}
if (rows.length > 1) {
  console.error(`✗ Имя неоднозначно (${rows.length} карточек), укажи id:`);
  for (const r of rows) console.error(`  ${r.id}  ${r.sprint_id} / ${r.name}`);
  process.exit(1);
}

const row = rows[0];
const data = row.data ?? {};
const existing = data.creatives ?? [];

// мёржим по индексу слота: текст/скоринг из файла, картинки из базы не теряем
const merged = incoming.map((c, i) => {
  const old = existing[i] ?? {};
  const slot = { ...old, ...c };
  if (old.image && !c.image) slot.image = old.image;
  if (old.images && !c.images) slot.images = old.images;
  return slot;
});
if (existing.length > merged.length) {
  console.warn(`⚠ в базе было ${existing.length} слотов, в файле ${merged.length}: лишние слоты будут удалены`);
}

console.log(`Карточка: ${row.sprint_id} / ${row.name} (${row.id})`);
for (const [i, s] of merged.entries()) {
  const head = s.text.replace(/<[^>]+>/g, "").slice(0, 55);
  console.log(`  #${i} ${head}… ${s.image ? "🖼" : ""}${s.images ? ` +${s.images.length}` : ""}`);
}
if (dry) {
  console.log("\n--dry: ничего не записано");
  process.exit(0);
}

data.creatives = merged;
const patchRes = await fetch(`${rest}?id=eq.${row.id}`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({ data }),
});
if (!patchRes.ok) throw new Error(`PATCH ${patchRes.status}: ${await patchRes.text()}`);
const updated = await patchRes.json();
console.log(`\n✓ Залито слотов: ${updated[0].data.creatives.length}`);
console.log("Дальше: python3 scripts/validate-creo.py \"<карточка>\" — валидатор гоняется по базе.");
