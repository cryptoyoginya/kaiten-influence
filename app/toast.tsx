"use client";
import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; msg: string; type: ToastType };
type ConfirmItem = {
  id: number;
  msg: string;
  okLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
};

let seq = 1;

/* ─── тосты ─── */
const toastListeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];
const emitToasts = () => toastListeners.forEach((l) => l([...toasts]));

export function toast(msg: string, type: ToastType = "info") {
  const id = seq++;
  toasts = [...toasts, { id, msg, type }];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, 4200);
}

/* ─── подтверждение ─── */
const confirmListeners = new Set<(c: ConfirmItem | null) => void>();
let confirmState: ConfirmItem | null = null;
const emitConfirm = () => confirmListeners.forEach((l) => l(confirmState));

export function confirmToast(
  msg: string,
  opts?: { okLabel?: string; danger?: boolean }
): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = {
      id: seq++,
      msg,
      okLabel: opts?.okLabel ?? "Да",
      danger: opts?.danger ?? false,
      resolve,
    };
    emitConfirm();
  });
}
function closeConfirm(v: boolean) {
  confirmState?.resolve(v);
  confirmState = null;
  emitConfirm();
}

const EMOJI: Record<ToastType, string> = { success: "🎉", error: "⚠️", info: "💬" };
const ACCENT: Record<ToastType, string> = {
  success: "#16a34a",
  error: "#e11d48",
  info: "#7d4ccf",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmItem | null>(null);
  useEffect(() => {
    const lt = (t: ToastItem[]) => setItems(t);
    const lc = (c: ConfirmItem | null) => setConfirm(c);
    toastListeners.add(lt);
    confirmListeners.add(lc);
    return () => {
      toastListeners.delete(lt);
      confirmListeners.delete(lc);
    };
  }, []);

  return (
    <>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className="toast-in pointer-events-auto flex items-start gap-3 rounded-xl bg-white shadow-lg border px-4 py-3 w-[340px]"
            style={{ borderColor: ACCENT[t.type] + "55" }}
          >
            <span className="text-[18px] leading-none mt-[1px]">{EMOJI[t.type]}</span>
            <span className="text-[13.5px] font-medium text-neutral-800 leading-snug">
              {t.msg}
            </span>
          </div>
        ))}
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold text-neutral-800 mb-4 leading-snug">
              {confirm.msg}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => closeConfirm(false)}
                className="rounded-lg px-4 py-2 text-[14px] font-semibold text-neutral-500 hover:bg-neutral-100"
              >
                Отмена
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`rounded-lg px-4 py-2 text-[14px] font-bold text-white ${
                  confirm.danger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-violet-600 hover:bg-violet-700"
                }`}
              >
                {confirm.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
