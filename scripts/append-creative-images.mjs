// Добавляет слот с картинками в data.creatives[] карточки НАПРЯМУЮ в Supabase.
// Не требует записи в data/sprints.json: сид отстаёт от базы, истина — в placements.
// Ключи берёт из окружения или .env.local; хватает anon-ключа (RLS открыт на запись,
// этим же ключом пишет сама платформа из браузера).
//
// Запуск:
//   node scripts/append-creative-images.mjs "<имя или id карточки>" \
//     [--slot N] /workshop/img/a.png /workshop/img/b.png ...
//
// Без --slot добавляется новый слот; с --slot N картинки ставятся существующему
// слоту N (тексты/баллы слота не трогаются). Первый путь становится главной
// картинкой (image), все — галереей images[] (один путь = только image).
// Идемпотентно: без --slot слоты с этими же картинками заменяются, не дублируются.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

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
let slotIndex = null;
const slotAt = argv.indexOf("--slot");
if (slotAt !== -1) {
  slotIndex = Number(argv[slotAt + 1]);
  argv.splice(slotAt, 2);
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    console.error("✗ --slot ожидает неотрицательный индекс слота");
    process.exit(1);
  }
}
const [card, ...images] = argv;
if (!card || images.length === 0) {
  console.error('Использование: node scripts/append-creative-images.mjs "<имя или id>" [--slot N] /workshop/img/*.png ...');
  process.exit(1);
}
for (const img of images) {
  if (!img.startsWith("/")) {
    console.error(`✗ Путь картинки должен начинаться с /: ${img}`);
    process.exit(1);
  }
  const local = join(ROOT, "public", img);
  if (!existsSync(local)) console.warn(`⚠ локально нет файла ${local} — не забудь про рендер и деплой`);
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
let creatives;
if (slotIndex !== null) {
  creatives = data.creatives ?? [];
  if (slotIndex >= creatives.length) {
    console.error(`✗ Слота ${slotIndex} нет: в карточке ${creatives.length} слотов`);
    process.exit(1);
  }
  const slot = { ...creatives[slotIndex], image: images[0] };
  if (images.length > 1) slot.images = images;
  else delete slot.images;
  creatives[slotIndex] = slot;
} else {
  creatives = (data.creatives ?? []).filter((c) => !images.includes(c?.image));
  const slot = { image: images[0] };
  if (images.length > 1) slot.images = images;
  creatives.push(slot);
}
data.creatives = creatives;

const patchRes = await fetch(`${rest}?id=eq.${row.id}`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({ data }),
});
if (!patchRes.ok) throw new Error(`PATCH ${patchRes.status}: ${await patchRes.text()}`);
const updated = await patchRes.json();
console.log(
  slotIndex !== null
    ? `✓ ${row.sprint_id} / ${row.name}: слоту ${slotIndex} поставлено ${images.length} картинок`
    : `✓ ${row.sprint_id} / ${row.name}: слот с ${images.length} картинками добавлен, всего слотов ${updated[0].data.creatives.length}`,
);
console.log("Дальше: npx vercel --prod, чтобы картинки открылись на проде.");
