"use client";

import { createBrowserClient } from "@supabase/ssr";

// Публичные значения клиента. Publishable-ключ по замыслу виден в браузере и
// защищён RLS — держим фолбэк прямо в коде, чтобы клиент работал независимо от
// того, попали ли NEXT_PUBLIC-переменные в сборку (env, если задан, перекрывает).
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zfgdnbhmyjjbxiviexiw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dDGky1txc9FEkv_mOHD-Vg_bt_FzOTZ";

// Браузерный клиент (для клиентских компонентов: редактор результатов и т.п.)
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}

// Включена ли интеграция с Supabase
export const SUPABASE_ENABLED = !!SUPABASE_URL && !!SUPABASE_KEY;
