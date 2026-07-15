#!/usr/bin/env python3
"""
CREO-валидатор: автономная финальная проверка текстов креативов карточки по правилам скилла creo.
Механические проверки (см. content/references/creo-gold-standard.md):
  - длинные тире «—» / «–» / «−»
  - запрещённые обороты «не X, а Y» (флип « а не ») и «не только … но и»
  - вклеенные инлайн-стили (font-family, color:rgb, <span>, <h4>, &nbsp;, var(--), font-size, ...)
  - жирные выделения <b> (минимум)
  - глубина продукта: ≥2 абзацев с продуктовыми терминами
  - ссылка/CTA (kaiten.ru)
  - Jira/Atlassian — запрещено для канала import-it
ICP-сверку скрипт НЕ делает (это шаг рассуждения в скилле) — печатает напоминание.

Usage: python3 scripts/validate-creo.py "<имя или id карточки>" [--import-it]
"""
import sys, os, re, json, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _env import supabase

URL, KEY = supabase()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

PRODUCT_KW = ["kaiten","доск","wip","гант","портфел","спринт","метрик","накопительн",
              "время цикла","база знаний","документ","импорт","тариф","интеграц","канбан",
              "процентил","пропускн","свимлайн","редполитик","реестр","on-prem","152-фз"]
JUNK = ["font-family","color:rgb","<span","<h4","&nbsp;","var(--","font-size","letter-spacing","caret-color"]

def strip(h): return re.sub("<[^>]+>", "", h or "")

def check(text):
    fails, warns = [], []
    plain = strip(text)
    low = plain.lower()
    # 1 длинные тире
    for d in ("—","–","−"):
        if d in plain: fails.append(f"длинное тире «{d}»")
    # 2 запрещённые обороты
    if " а не " in plain: fails.append("оборот « а не » (флип «не X, а Y»)")
    if re.search(r"не только\b.{0,60}?\bно и\b", low): fails.append("оборот «не только … но и»")
    # 3 инлайн-мусор
    for j in JUNK:
        if j in (text or ""): fails.append(f"инлайн-мусор «{j}»")
    # 4 жирный
    b = (text or "").count("<b>")
    if b == 0: fails.append("нет жирных выделений <b>")
    elif b < 3: warns.append(f"мало жирного (<b>×{b}, желательно ≥3)")
    # 5 глубина продукта: абзацы с продуктовыми терминами
    paras = re.split(r"</p>", text or "")
    prod_paras = sum(1 for p in paras if any(k in strip(p).lower() for k in PRODUCT_KW if k != "kaiten"))
    if "kaiten" not in low: warns.append("нет упоминания Kaiten")
    if prod_paras < 2: fails.append(f"мало продукта: {prod_paras} абзац(ев) с фичами (нужно ≥2)")
    # 6 ссылка
    if "kaiten.ru" not in low: warns.append("нет ссылки kaiten.ru")
    return fails, warns

def trigrams(text):
    words = re.findall(r"[а-яёa-z0-9]+", text.lower())
    return set(tuple(words[i:i+3]) for i in range(len(words)-2))

def diversity_check(texts):
    """Механический diversity-гейт: похожесть пар вариантов по 3-граммам слов,
    совпадение первых строк и CTA. Возвращает список нарушений."""
    fails = []
    plains = [strip(t) for t in texts]
    grams = [trigrams(p) for p in plains]
    for i in range(len(texts)):
        for j in range(i+1, len(texts)):
            a, b = grams[i], grams[j]
            if not a or not b: continue
            jac = len(a & b) / len(a | b)
            if jac > 0.35:
                fails.append(f"варианты #{i} и #{j} — клоны (похожесть {jac:.0%}, порог 35%)")
            elif jac > 0.22:
                fails.append(f"⚠ варианты #{i} и #{j} близки ({jac:.0%}) — проверить скелет")
    # первые строки (хуки) не должны совпадать по началу
    hooks = [p.strip()[:60].lower() for p in plains]
    for i in range(len(hooks)):
        for j in range(i+1, len(hooks)):
            if hooks[i] and hooks[i][:25] == hooks[j][:25]:
                fails.append(f"варианты #{i} и #{j} — одинаковое открытие (первые строки)")
    # CTA-строки (последний абзац) не должны быть одинаковыми
    ctas = [re.split(r"\n|</p>", p.strip())[-1][:50].lower() if p.strip() else "" for p in plains]
    seen = {}
    for i, c in enumerate(ctas):
        if c and c in seen:
            fails.append(f"варианты #{seen[c]} и #{i} — одинаковый CTA")
        seen[c] = i
    return fails

def main():
    if len(sys.argv) < 2:
        print("usage: validate-creo.py \"<имя или id карточки>\" [--import-it]"); sys.exit(2)
    key = sys.argv[1]; is_import = "--import-it" in sys.argv
    # fetch by id or name
    if re.match(r"^[0-9a-f]{8}-", key):
        q = f"id=eq.{key}"
    else:
        q = f"name=ilike.*{urllib.parse.quote(key)}*"
    rows = json.load(urllib.request.urlopen(urllib.request.Request(
        f"{URL}/rest/v1/placements?select=id,name,data&{q}", headers=H)))
    if not rows: print("карточка не найдена:", key); sys.exit(2)
    r = rows[0]
    creatives = (r.get("data") or {}).get("creatives") or []
    print(f"=== ВАЛИДАЦИЯ: {r.get('name')} ({len(creatives)} креативов) ===")
    total_fail = 0
    for i, c in enumerate(creatives):
        t = c.get("text") or ""
        if not t.strip():
            print(f"\n#{i}: пусто, пропуск"); continue
        fails, warns = check(t)
        if is_import and re.search(r"jira|atlassian", t, re.I):
            fails.append("Jira/Atlassian (запрещено для import-it)")
        head = strip(t)[:50]
        status = "❌ FAIL" if fails else ("⚠ WARN" if warns else "✅ PASS")
        print(f"\n#{i} {status} | {head}")
        for f in fails: print("   ❌", f)
        for w in warns: print("   ⚠ ", w)
        total_fail += len(fails)
    # diversity сета целиком
    texts = [c.get("text") or "" for c in creatives if (c.get("text") or "").strip()]
    if len(texts) >= 2:
        div = diversity_check(texts)
        if div:
            print("\n=== DIVERSITY сета ===")
            for d in div:
                print("   " + ("⚠ " if d.startswith("⚠") else "❌ ") + d.lstrip("⚠ "))
            total_fail += sum(1 for d in div if not d.startswith("⚠"))
        else:
            print("\n=== DIVERSITY сета: ✅ варианты различны (3-граммы, хуки, CTA) ===")
    print(f"\n--- ИТОГО: {total_fail} нарушений в {len(creatives)} креативах ---")
    print("ℹ ICP-сверку сделать вручную в скилле: для каждого текста назвать задетую ICP-роль/боль")
    print("  из content/references/icp-kaiten.md; текст без попадания в ICP — на переделку.")
    sys.exit(1 if total_fail else 0)

if __name__ == "__main__":
    import urllib.parse
    main()
