// Рендерит HTML-макеты креативов в PNG через headless Chrome в 2× (retina).
//
// Закрывает шаг 6 пайплайна (`docs/CREO-RUNBOOK.md`): раньше рендер жил только
// в памяти агента, скрипта в репозитории не было — на новом ноуте шаг воспроизвести
// было нечем. Теперь путь к Chrome ищется автоматически, а размер кадра берётся
// из самого макета (data-w/data-h на <body> или .frame), поэтому один и тот же
// исходник нельзя случайно отрендерить в чужом формате.
//
// Запуск:
//   node scripts/render-creative-images.mjs public/workshop/img/foo.html [...ещё html]
//   node scripts/render-creative-images.mjs public/workshop/img/z1-*.html
//   CHROME=/path/to/chrome node scripts/render-creative-images.mjs ...
//
// PNG кладётся рядом с HTML под тем же именем. Размер по умолчанию 1080×1080.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Chrome for Testing, скачанный через @puppeteer/browsers, живёт в кэше;
// системный Chrome тоже подходит. Первый найденный побеждает.
function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const caches = [
    join(process.env.HOME ?? "", ".cache/puppeteer/chrome"),
    join(process.env.TMPDIR ?? "/tmp", "chrome"),
    resolve(ROOT, "..", "chrome"),
  ];
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    for (const ver of safeLs(cache)) {
      const p = join(cache, ver, "chrome-mac-arm64", "Google Chrome for Testing.app",
        "Contents", "MacOS", "Google Chrome for Testing");
      if (existsSync(p)) candidates.push(p);
      const l = join(cache, ver, "chrome-linux64", "chrome");
      if (existsSync(l)) candidates.push(l);
    }
  }
  return candidates.find((p) => existsSync(p)) ?? null;
}
function safeLs(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

const CHROME = findChrome();
if (!CHROME) {
  console.error("✗ Chrome не найден. Поставь его один раз:");
  console.error("    npx @puppeteer/browsers install chrome@stable");
  console.error("  либо укажи путь явно: CHROME=/path/to/chrome node scripts/render-creative-images.mjs ...");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Использование: node scripts/render-creative-images.mjs <файл.html> [...]");
  process.exit(1);
}

// Размер кадра: data-w/data-h на body или .frame, иначе width/height у .frame в CSS.
function frameSize(html) {
  const attr = html.match(/data-w=["'](\d+)["']\s+data-h=["'](\d+)["']/);
  if (attr) return { w: +attr[1], h: +attr[2] };
  const css = html.match(/\.frame\s*\{[^}]*?width:\s*(\d+)px[^}]*?height:\s*(\d+)px/s);
  if (css) return { w: +css[1], h: +css[2] };
  return { w: 1080, h: 1080 };
}

let failed = 0;
for (const f of files) {
  const html = resolve(f);
  if (!existsSync(html)) { console.error(`✗ нет файла: ${f}`); failed++; continue; }
  const src = readFileSync(html, "utf-8");
  const { w, h } = frameSize(src);
  const png = join(dirname(html), basename(html).replace(/\.html$/, ".png"));
  try {
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--force-device-scale-factor=2",
      "--default-background-color=00000000",
      `--window-size=${w},${h}`,
      `--screenshot=${png}`,
      // шрифты Google Fonts тянутся из сети — даём время на загрузку
      "--virtual-time-budget=6000",
      `file://${html}`,
    ], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    console.error(`✗ рендер упал: ${basename(html)}\n${e.stderr?.toString().slice(0, 300) ?? e.message}`);
    failed++; continue;
  }
  if (!existsSync(png)) { console.error(`✗ PNG не создан: ${basename(png)}`); failed++; continue; }
  const { w: gw, h: gh } = pngSize(png);
  const ok = gw === w * 2 && gh === h * 2;
  console.log(`${ok ? "✓" : "⚠"} ${basename(png)} — ${gw}×${gh} (ожидалось ${w * 2}×${h * 2}), ${(statSync(png).size / 1024).toFixed(0)} КБ`);
  if (!ok) failed++;
}

function pngSize(p) {
  const b = readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

console.log(failed ? `\n--- ${failed} проблем(ы) ---` : `\n--- готово: ${files.length} PNG ---`);
console.log("Дальше: node scripts/append-creative-images.mjs \"<карточка>\" [--slot N] /workshop/img/*.png");
process.exit(failed ? 1 : 0);
