"""Подхват ключей Supabase из .env.local для python-скриптов.

Зачем: mjs-скрипты читают .env.local через process.loadEnvFile, а python-скрипты
раньше требовали SUPABASE_SERVICE_KEY в окружении и падали на чистой машине
(«SUPABASE_SERVICE_KEY не задан»), хотя ключ лежал в .env.local. Anon-ключа хватает:
RLS открыт на запись, им же пишет платформа из браузера.

Использование:
    from _env import supabase
    URL, KEY = supabase()
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_URL = "https://zfgdnbhmyjjbxiviexiw.supabase.co"


def load_env_local(path=None):
    """Читает .env.local и кладёт значения в os.environ, не затирая уже заданные."""
    path = path or os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            os.environ.setdefault(key, val)


def supabase():
    """Возвращает (URL, KEY). Порядок ключей тот же, что в mjs-скриптах."""
    load_env_local()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or DEFAULT_URL
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not key:
        raise SystemExit(
            "✗ Ключ Supabase не найден. Положи NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local "
            "или задай SUPABASE_SERVICE_KEY в окружении."
        )
    return url, key
