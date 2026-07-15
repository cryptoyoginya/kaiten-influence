#!/usr/bin/env python3
"""
Долг по факту: опубликованные размещения без замеров (MEDIA-PLAYBOOK §4).

Проверяет:
  1. placements с пройденным этапом «Опубликовано» / integrations.published=true,
     у которых пусто result.reach.views или result.conversion.clicks;
  2. ab-plan.json наборов, где facts.published_variant есть, а метрики null.

Usage: python3 scripts/check-facts.py
Exit 1, если есть долги (удобно для cron/CI).
"""
import os, re, sys, json, glob, urllib.request, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _env import supabase

URL, KEY = supabase()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=H)
    return json.load(urllib.request.urlopen(req))

def parse_date(s):
    if not s: return None
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s.strip())
    if m: return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s.strip())
    if m: return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None

def main():
    today = datetime.date.today()
    debts = []

    # 1) опубликованные интеграции без факта
    for it in get("integrations?select=id,name,date,published,result"):
        if not it.get("published"): continue
        r = it.get("result") or {}
        views = ((r.get("reach") or {}).get("views") or "").strip()
        clicks = ((r.get("conversion") or {}).get("clicks") or "").strip()
        d = parse_date(it.get("date"))
        age = (today - d).days if d else None
        missing = []
        if not views: missing.append("просмотры")
        if not clicks: missing.append("клики")
        if missing:
            when = f"T+{age}д" if age is not None else "дата не указана"
            urgent = "🔴" if (age is not None and age >= 3) else "🟡"
            debts.append(f"{urgent} {it.get('name')}: опубликовано ({when}), нет: {', '.join(missing)}")

    # 2) placements на этапе «Опубликовано» без интеграции с фактом — ловим через steps
    pls = get("placements?select=id,name,post_date,steps")
    known = {d.split(': ')[0].split(' ', 1)[-1] for d in debts}
    for p in pls:
        steps = p.get("steps") or {}
        if steps.get("Опубликовано") and not steps.get("Аналитика") and p.get("name") not in known:
            d = parse_date(p.get("post_date"))
            age = (today - d).days if d else None
            if age is None or age >= 1:
                debts.append(f"🟡 {p.get('name')}: этап «Опубликовано» пройден, «Аналитика» не закрыта")

    # 3) ab-plan.json: факты null при опубликованном варианте
    for f in glob.glob(os.path.join(ROOT, "content/channels/*/sets/*/ab-plan.json")):
        try:
            ab = json.load(open(f))
        except Exception:
            continue
        facts = ab.get("facts") or {}
        if facts.get("published_variant") and not facts.get("post_reach"):
            rel = os.path.relpath(f, ROOT)
            debts.append(f"🟡 {rel}: вариант опубликован, facts не заполнены")

    print(f"=== ДОЛГ ПО ФАКТУ · {today.isoformat()} ===")
    if not debts:
        print("✅ долгов нет: у всего опубликованного есть замеры")
        return 0
    for d in debts: print(d)
    print(f"\n{len(debts)} долг(ов). Ритуал: T+24ч просмотры/реакции, T+72ч клики по UTM,")
    print("затем калибровка ab-plan (MEDIA-PLAYBOOK §4, CREO-RUNBOOK шаг 9).")
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
