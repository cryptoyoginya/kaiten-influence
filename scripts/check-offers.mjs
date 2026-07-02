// Валидатор конкурентных офферов: математика, свежесть, схема, покрытие.
// Запуск: node scripts/check-offers.mjs
// Документация механизма: docs/COMPETITORS.md
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEG_DIR = join(ROOT, "content", "segments");
const CH_DIR = join(ROOT, "content", "channels");

// веса рубрики — единые с креативами (docs/SCORING.md)
const W = { mmf: 2.5, persona: 2, objections: 2, claims: 2, cta: 1.5, craft: 1 };
const SUM_W = Object.values(W).reduce((a, b) => a + b, 0); // 11

const STALE_DAYS = 30;
let errors = 0, warnings = 0;
const err = (m) => { console.log(`  ✗ ${m}`); errors++; };
const warn = (m) => { console.log(`  ⚠ ${m}`); warnings++; };
const ok = (m) => console.log(`  ✓ ${m}`);

const zoneOf = (c) => (c >= 80 ? "green" : c >= 60 ? "yellow" : "red");
const ageDays = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000));

const segments = readdirSync(SEG_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

for (const seg of segments) {
  console.log(`\n■ Сегмент: ${seg}`);
  const file = join(SEG_DIR, seg, "competitors.json");
  if (!existsSync(file)) { err(`нет competitors.json — бенчмарк сегмента не работает`); continue; }
  let data;
  try { data = JSON.parse(readFileSync(file, "utf-8")); }
  catch (e) { err(`битый JSON: ${e.message}`); continue; }

  const captured = data.meta?.captured_at;
  if (!captured) warn("meta.captured_at отсутствует — свежесть не проверить");
  else {
    const age = ageDays(captured);
    if (age > STALE_DAYS) warn(`офферы сняты ${age} дн. назад (порог ${STALE_DAYS}) — переснять`);
    else ok(`свежесть: ${age} дн.`);
  }
  if (data.meta?.todo) warn(`TODO в meta: ${data.meta.todo}`);

  const comps = data.competitors ?? [];
  if (comps.length < 2) warn(`конкурентов ${comps.length} — для бенчмарка нужно 3–5`);
  for (const c of comps) {
    const tag = c.brand ?? "<без имени>";
    if (!c.source) err(`${tag}: нет source (URL снятия)`);
    if (!c.lesson) err(`${tag}: нет lesson — оффер без урока в файл не заносится`);
    if (!c.offer_quotes?.length) err(`${tag}: нет дословных цитат оффера`);
    else for (const q of c.offer_quotes)
      if (!["FACT", "INFERENCE", "RISK"].includes(q.type)) err(`${tag}: цитата без разметки FACT/INF/RISK: «${(q.quote ?? "").slice(0, 40)}…»`);
    if (!c.lenses) { err(`${tag}: нет линз`); continue; }
    const calc = Math.round(
      (Object.entries(W).reduce((s, [k, w]) => s + (c.lenses[k] ?? NaN) * w, 0) / SUM_W) * 10
    ) / 10;
    if (Number.isNaN(calc)) err(`${tag}: неполные линзы (нужны ${Object.keys(W).join(", ")})`);
    else if (Math.abs(calc - c.composite) > 0.1) err(`${tag}: composite ${c.composite} ≠ пересчёту ${calc}`);
    else ok(`${tag}: composite ${c.composite} сходится`);
    if (c.zone && zoneOf(c.composite) !== c.zone) err(`${tag}: зона «${c.zone}» не соответствует composite ${c.composite}`);
  }
}

// покрытие каналов: у каждого канала — сегмент с файлом конкурентов
console.log(`\n■ Покрытие каналов`);
const channels = existsSync(CH_DIR)
  ? readdirSync(CH_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const ch of channels) {
  const passport = join(CH_DIR, ch, "channel.md");
  if (!existsSync(passport)) { warn(`${ch}: нет channel.md`); continue; }
  const md = readFileSync(passport, "utf-8");
  const m = md.match(/segments\/([a-z0-9-]+)\/panel\.md/);
  if (!m) { warn(`${ch}: в паспорте не указана сегмент-панель`); continue; }
  const seg = m[1];
  if (!existsSync(join(SEG_DIR, seg, "competitors.json")))
    err(`${ch}: сегмент ${seg} без competitors.json`);
  else ok(`${ch} → ${seg}`);
}

console.log(`\n${errors ? "✗" : "✓"} Итог: ошибок ${errors}, предупреждений ${warnings}`);
process.exit(errors ? 1 : 0);
