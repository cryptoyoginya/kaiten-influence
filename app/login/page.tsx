"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-7">
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-block w-7 h-7 rounded-[var(--radius-md)] bg-[var(--color-accent)]" />
          <span className="font-semibold text-[16px]">Инфлюенс-маркетинг</span>
        </div>

        {sent ? (
          <div>
            <h1 className="text-[18px] font-semibold mb-2">Проверь почту</h1>
            <p className="text-[14px] text-[var(--color-muted)]">
              Отправили ссылку для входа на <b>{email}</b>. Перейди по ней — и
              окажешься внутри.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h1 className="text-[18px] font-semibold mb-1">Вход</h1>
            <p className="text-[13px] text-[var(--color-muted)] mb-4">
              Введи рабочую почту — пришлём ссылку для входа, без пароля.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.ru"
              className="w-full h-10 px-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[14px] outline-none focus:border-[var(--color-accent)]"
            />
            {err && <p className="text-[12px] text-[var(--color-red)] mt-2">{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 mt-3 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium disabled:opacity-60"
            >
              {busy ? "Отправляем…" : "Получить ссылку"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
