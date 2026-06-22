"use client";

import { useEffect, useState } from "react";

const PASS = process.env.NEXT_PUBLIC_APP_PASSCODE || "kaiteninfluence";
const KEY = "kaiten-gate-ok";

export default function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    setOk(localStorage.getItem(KEY) === "1");
    setReady(true);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (val.trim() === PASS) {
      localStorage.setItem(KEY, "1");
      setOk(true);
    } else {
      setErr(true);
    }
  }

  if (!ready) return null;
  if (ok) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-7"
      >
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-block w-7 h-7 rounded-[var(--radius-md)] bg-[var(--color-accent)]" />
          <span className="font-semibold text-[16px]">Инфлюенс-маркетинг</span>
        </div>
        <h1 className="text-[18px] font-semibold mb-1">Вход</h1>
        <p className="text-[13px] text-[var(--color-muted)] mb-4">
          Введи общий пароль команды — один раз на этом устройстве.
        </p>
        <input
          autoFocus
          type="password"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setErr(false);
          }}
          placeholder="пароль"
          className="w-full h-10 px-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[14px] outline-none focus:border-[var(--color-accent)]"
        />
        {err && <p className="text-[12px] text-[var(--color-red)] mt-2">Неверный пароль</p>}
        <button
          type="submit"
          className="w-full h-10 mt-3 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
