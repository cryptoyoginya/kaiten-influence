"use client";

import { createBrowserClient } from "@supabase/ssr";

// Браузерный клиент (для клиентских компонентов: редактор результатов и т.п.)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Включена ли интеграция с Supabase (есть ли ключи в окружении)
export const SUPABASE_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
