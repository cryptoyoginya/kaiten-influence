"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Sprint, Placement } from "@/lib/data";
import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/client";

const STEPS = [
  "Внутреннее согласование",
  "Согласование с инфлом",
  "Реквизиты для договора",
  "Договор готов",
  "Договор подписан",
  "Оплата",
  "Маркировка получена",
  "Маркировка в посте",
  "Опубликовано",
  "Аналитика",
];

// что вносить на каждом шаге → поле в placement.data
type FieldKey =
  | "creative"
  | "contract_data"
  | "contract_file"
  | "payment"
  | "erid"
  | "post_link"
  | "analytics_link";
const STAGE_FIELD: { key: FieldKey; label: string; file?: boolean }[] = [
  { key: "creative", label: "Креатив — ссылка или файл", file: true },
  { key: "creative", label: "Креатив — согласовать с автором", file: true },
  { key: "contract_data", label: "Данные для договора (реквизиты, ИНН)" },
  { key: "contract_file", label: "Договор — файл или ссылка", file: true },
  { key: "contract_file", label: "Подписанный договор", file: true },
  { key: "payment", label: "Счёт / оплата (сумма, ссылка)" },
  { key: "erid", label: "Маркировка — токен ERID" },
  { key: "erid", label: "Маркировка нанесена — ERID в посте" },
  { key: "post_link", label: "Ссылка на опубликованный пост" },
  { key: "analytics_link", label: "Аналитика — ссылка или итоги" },
];

function num(s: string): number {
  const m = String(s ?? "").replace(/\s| /g, "").match(/-?\d+[.,]?\d*/);
  return m ? parseFloat(m[0].replace(",", ".")) : 0;
}
// разбор даты: ДД.ММ.ГГГГ, ISO (2026-06-23…)
function parseDate(s: string): Date | null {
  const t = String(s ?? "").trim();
  let m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return new Date(y, +m[2] - 1, +m[1]);
  }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function fmtDate(s: string): string {
  const d = parseDate(s);
  if (!d) return s || "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function weekRange(from: string, to: string): string {
  const a = parseDate(from), b = parseDate(to);
  if (!a || !b) return "";
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dm(a)}–${dm(b)}`;
}
const DUE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  red: { bg: "#fde8e6", fg: "#b3261e", border: "#f44336" },
  orange: { bg: "#fff3e0", fg: "#b26a00", border: "#ffa100" },
  amber: { bg: "#fff8e1", fg: "#8a6d00", border: "#e0b400" },
  green: { bg: "#e9f5ea", fg: "#2e7d32", border: "#4caf51" },
};
// сколько дней до даты + цвет по срочности
function dueInfo(s: string): { label: string; cls: keyof typeof DUE_COLORS } | null {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (n < 0) return { label: `просрочено на ${-n} дн.`, cls: "red" };
  if (n === 0) return { label: "сегодня", cls: "red" };
  if (n === 1) return { label: "завтра", cls: "orange" };
  if (n <= 3) return { label: `через ${n} дн.`, cls: "orange" };
  if (n <= 7) return { label: `через ${n} дн.`, cls: "amber" };
  return { label: `через ${n} дн.`, cls: "green" };
}

// пустой результат интеграции (для авто-создания в Результатах)
const EMPTY_RESULT = {
  post_link: "", format: "",
  costs: { price: "", marking: "", tax: "", total: "" },
  reach: { views: "", reach: "", likes: "", reposts: "", comments_count: "", er: "" },
  conversion: { clicks: "", registrations: "", activations: "", paying: "", revenue: "" },
  unit: { cpv: "", cpm: "", ctr: "", cpl: "", cac: "", romi: "", payback: "" },
  screens: { creative: "", stats: "", comments: [] as string[] },
  lessons: { sentiment: "", worked: "", failed: "", learned: "", verdict: "" },
};

// ссылка на статистику канала в TGStat из ссылки t.me
function tgstatUrl(link: string): string {
  const m = String(link ?? "").match(/t\.me\/([a-zA-Z0-9_]{3,})/);
  return m ? `https://tgstat.ru/channel/@${m[1]}` : "";
}

function stageHint(key: string): string {
  switch (key) {
    case "creative":
      return "Заполни блок «Креатив»: картинка, текст и согласования.";
    case "contract_data":
    case "contract_file":
      return "Заполни блок «Договор»: реквизиты и файл.";
    case "payment":
      return "Внеси оплату в блоке «Артефакты по этапам».";
    case "erid":
      return "Внеси erid в блоке «Маркировка».";
    case "post_link":
      return "Добавь ссылку на пост в блоке «Артефакты по этапам».";
    case "analytics":
      return "Добавь аналитику в блоке «Артефакты по этапам».";
    default:
      return "";
  }
}

function stageOf(p: Placement): number {
  for (let i = 0; i < STEPS.length; i++) if (!p.steps?.[STEPS[i]]) return i;
  return STEPS.length;
}
function doneCount(p: Placement): number {
  return STEPS.filter((s) => p.steps?.[s]).length;
}

export default function SprintBoard({ sprints }: { sprints: Sprint[] }) {
  const [weeks, setWeeks] = useState<Sprint[]>(
    sprints.length ? sprints : [{ id: "week-1", title: "Неделя 1", date_from: "", date_to: "", status: "active", placements: [] }]
  );
  const [wi, setWi] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const supabase = useMemo(() => (SUPABASE_ENABLED ? createClient() : null), []);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const current = weeks[Math.min(wi, weeks.length - 1)];
  const items = current.placements;
  // обновление списка размещений текущей недели
  function setItems(updater: (prev: Placement[]) => Placement[]) {
    setWeeks((prev) =>
      prev.map((w, i) => (i === wi ? { ...w, placements: updater(w.placements) } : w))
    );
  }

  const econ = useMemo(() => {
    const spent = items.reduce((a, p) => a + num(p.price_discount || p.price), 0);
    const reach = items.reduce((a, p) => a + num(p.forecast_reach), 0);
    return { spent, reach, count: items.length };
  }, [items]);

  function scheduleSave(p: Placement) {
    if (!supabase || !p.id || p.id.startsWith("tmp-")) return;
    clearTimeout(timers.current[p.id]);
    setSaveState("saving");
    timers.current[p.id] = setTimeout(async () => {
      await supabase.from("placements").update(rowOf(p)).eq("id", p.id!);
      await ensureIntegration(p);
      setSaveState("saved");
    }, 500);
  }

  async function saveNow(p: Placement) {
    if (!supabase || !p.id || p.id.startsWith("tmp-")) {
      setSaveState("saved");
      return;
    }
    clearTimeout(timers.current[p.id]);
    setSaveState("saving");
    await supabase.from("placements").update(rowOf(p)).eq("id", p.id);
    await ensureIntegration(p);
    setSaveState("saved");
  }

  // при публикации заводим карточку в Результатах (если ещё нет)
  async function ensureIntegration(p: Placement) {
    if (!supabase || !p.id || p.id.startsWith("tmp-")) return;
    if (!p.steps?.["Опубликовано"]) return;
    await supabase.from("integrations").upsert(
      {
        id: `pl-${p.id}`,
        sprint_id: p.sprint_id ?? current.id,
        name: p.name,
        niche: "",
        date: p.post_date,
        landing: p.landing,
        published: true,
        brief: {
          author_desc: p.author_desc, audience: p.audience, date: p.post_date,
          post_topic: p.post_topic, offer: p.offer, creative: p.creative,
          landing: p.landing, utm: p.utm,
        },
        plan: {
          price: p.price_discount || p.price, reach: p.forecast_reach,
          cpv: p.forecast_cpv, err: p.err, views: p.avg_views,
        },
        result: {
          ...EMPTY_RESULT,
          costs: {
            ...EMPTY_RESULT.costs,
            price: p.price_discount || p.price || "",
            total: num(p.price_discount || p.price)
              ? String(Math.round(num(p.price_discount || p.price)))
              : "",
          },
        },
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  }

  function update(id: string, mut: (p: Placement) => void) {
    setItems((prev) => {
      const next = prev.map((p) => {
        if ((p.id ?? p.name) !== id) return p;
        const c: Placement = structuredClone(p);
        mut(c);
        return c;
      });
      const changed = next.find((p) => (p.id ?? p.name) === id);
      if (changed) scheduleSave(changed);
      return next;
    });
  }

  function moveTo(id: string, stage: number) {
    update(id, (p) => {
      p.steps = p.steps ?? {};
      STEPS.forEach((s, i) => (p.steps[s] = i < stage));
    });
  }

  async function create() {
    const tmpId = "tmp-" + Date.now();
    const sprintId = current.id;
    const blank: Placement = {
      id: tmpId,
      sprint_id: sprintId,
      name: "",
      author_desc: "", audience: "", post_date: "", post_topic: "", offer: "",
      creative: "", landing: "", utm: "", price: "", price_discount: "",
      subscribers: "", avg_views: "", err: "", forecast_reach: "", forecast_cpv: "",
      steps: {}, data: {},
    };
    // сразу показываем карточку и открываем редактор
    setItems((prev) => [blank, ...prev]);
    setOpenId(tmpId);
    if (supabase) {
      const { data, error } = await supabase
        .from("placements")
        .insert({ ...rowOf(blank), sprint_id: sprintId })
        .select("id")
        .single();
      if (!error && data) {
        // подставляем реальный id и сохраняем то, что уже могли вписать
        let saved: Placement | undefined;
        setItems((prev) => {
          const next = prev.map((p) => (p.id === tmpId ? { ...p, id: data.id } : p));
          saved = next.find((p) => p.id === data.id);
          return next;
        });
        setOpenId((cur) => (cur === tmpId ? data.id : cur));
        if (saved) await supabase.from("placements").update(rowOf(saved)).eq("id", data.id);
      } else if (error) {
        console.error("create placement:", error.message);
      }
    }
  }

  async function remove(id: string) {
    const p = items.find((x) => (x.id ?? x.name) === id);
    if (supabase && p?.id) await supabase.from("placements").delete().eq("id", p.id);
    setItems((prev) => prev.filter((x) => (x.id ?? x.name) !== id));
    setOpenId(null);
  }

  async function moveToWeek(targetId: string) {
    if (!open || targetId === current.id) return;
    const p = open;
    const key = p.id ?? p.name;
    if (supabase && p.id) await supabase.from("placements").update({ sprint_id: targetId }).eq("id", p.id);
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.id === current.id)
          return { ...w, placements: w.placements.filter((x) => (x.id ?? x.name) !== key) };
        if (w.id === targetId)
          return { ...w, placements: [{ ...p, sprint_id: targetId }, ...w.placements] };
        return w;
      })
    );
    setOpenId(null);
  }

  async function uploadFile(file: File): Promise<string> {
    if (!supabase) return URL.createObjectURL(file);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `placements/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("screens").upload(path, file);
    if (error) return "";
    return supabase.storage.from("screens").getPublicUrl(path).data.publicUrl;
  }

  const cols = useMemo(() => {
    const arr: Placement[][] = Array.from({ length: STEPS.length + 1 }, () => []);
    items.forEach((p) => arr[Math.min(stageOf(p), STEPS.length)].push(p));
    return arr;
  }, [items]);

  const open = items.find((p) => (p.id ?? p.name) === openId) ?? null;

  return (
    <div>
      {/* листалка недель */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWi((i) => Math.max(0, i - 1))}
            disabled={wi === 0}
            className="w-10 h-10 grid place-items-center rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[18px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:hover:border-[var(--color-line)]"
            aria-label="Предыдущая неделя"
          >
            ‹
          </button>
          <WeekPicker weeks={weeks} wi={Math.min(wi, weeks.length - 1)} onPick={setWi} />
          <button
            onClick={() => setWi((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={wi >= weeks.length - 1}
            className="w-10 h-10 grid place-items-center rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[18px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:hover:border-[var(--color-line)]"
            aria-label="Следующая неделя"
          >
            ›
          </button>
        </div>
        <button
          onClick={create}
          className="h-9 px-4 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium"
        >
          + размещение
        </button>
      </div>

      {/* мини-дашборд недели */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MiniStat label="Размещений" value={String(econ.count)} />
        <MiniStat label="Итоговая стоимость" value={fmt(econ.spent) + " ₽"} />
        <MiniStat label="Прогноз охвата" value={fmtShort(econ.reach)} />
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {cols.map((cards, ci) => {
            const done = ci === STEPS.length;
            return (
              <div
                key={ci}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(ci);
                }}
                onDragLeave={() => setDragOver((d) => (d === ci ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("id");
                  if (id) moveTo(id, ci);
                  setDragOver(null);
                }}
                className={[
                  "w-[210px] shrink-0 rounded-[var(--radius-lg)] p-1.5 transition-colors",
                  dragOver === ci ? "bg-[var(--color-accent-soft)]" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-[var(--radius-md)] text-[12px] font-medium",
                    done
                      ? "bg-[var(--color-green-soft)] text-[#2e7d32]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
                  ].join(" ")}
                >
                  {!done && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-accent-soft)] text-[10px] text-[var(--color-accent-hover)]">
                      {ci + 1}
                    </span>
                  )}
                  <span className="leading-tight">{done ? "Готово" : STEPS[ci]}</span>
                  <span className="ml-auto opacity-60">{cards.length}</span>
                </div>

                <div className="flex flex-col gap-2 min-h-[40px]">
                  {cards.map((p) => (
                    <Card
                      key={p.id ?? p.name}
                      p={p}
                      onOpen={() => {
                        setSaveState("idle");
                        setOpenId(p.id ?? p.name);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <Editor
          p={open}
          id={open.id ?? open.name}
          update={update}
          remove={remove}
          upload={uploadFile}
          saveState={saveState}
          onSave={() => saveNow(open)}
          onClose={() => setOpenId(null)}
          weeks={weeks.map((w) => ({ id: w.id, title: w.title }))}
          currentId={current.id}
          onMoveWeek={moveToWeek}
        />
      )}
    </div>
  );
}

/* ───────── карточка на доске ───────── */
function Card({ p, onOpen }: { p: Placement; onOpen: () => void }) {
  const done = doneCount(p);
  const stage = stageOf(p);
  const field = stage < STEPS.length ? STAGE_FIELD[stage] : null;
  const filled = field
    ? field.key === "creative"
      ? !!(p.data?.approve_dima && p.data?.approve_dasha && p.data?.approve_lesha)
      : !!p.data?.[field.key]
    : true;
  const published = !!p.steps?.["Опубликовано"];
  const due = dueInfo(p.post_date);
  const borderColor = published
    ? DUE_COLORS.green.border
    : due
      ? DUE_COLORS[due.cls].border
      : null;
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("id", p.id ?? p.name)}
      onClick={onOpen}
      style={borderColor ? { borderColor, borderLeftWidth: 3 } : undefined}
      className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5 cursor-pointer hover:border-[var(--color-accent)]"
    >
      <div className="text-[13px] font-medium leading-snug">{p.name || "—"}</div>
      <div className="mt-1.5">
        <DatePill s={p.post_date} published={published} />
      </div>
      {p.data?.now_needed && (
        <div className="text-[11px] text-[#b26a00] mt-1 line-clamp-2">
          ⚡ {p.data.now_needed}
        </div>
      )}
      {field && (
        <div
          className={[
            "mt-1.5 text-[10px] px-1.5 py-0.5 rounded inline-block",
            filled
              ? "bg-[var(--color-green-soft)] text-[#2e7d32]"
              : "bg-[var(--color-orange-soft)] text-[#b26a00]",
          ].join(" ")}
        >
          {filled ? "✓ " : "нужно: "}
          {field.key === "contract_file" || field.key === "contract_data"
            ? "договор"
            : field.key === "creative"
              ? "креатив"
              : field.key === "payment"
                ? "оплата"
                : field.key === "erid"
                  ? "маркировка"
                  : field.key === "post_link"
                    ? "пост"
                    : "аналитика"}
        </div>
      )}
      {(p.data?.ref_ready || p.data?.ref_registered) && (
        <div className="mt-1.5">
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] font-medium">
            реферал{p.data?.ref_registered ? " · зарегистрирован" : ""}
          </span>
        </div>
      )}
      {published && !p.data?.ord_report_done && (
        <div className="mt-1.5">
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-red-soft)] text-[#b3261e] font-medium">
            ⚠️ отчёт в ОРД не сдан
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span>{(p.price_discount || p.price || "—") + (p.price ? " ₽" : "")}</span>
        <span className="text-[var(--color-faint)]">{done}/10</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${(done / 10) * 100}%` }} />
      </div>
    </div>
  );
}

/* ───────── редактор карточки ───────── */
function Editor({
  p,
  id,
  update,
  remove,
  upload,
  saveState,
  onSave,
  onClose,
  weeks,
  currentId,
  onMoveWeek,
}: {
  p: Placement;
  id: string;
  update: (id: string, mut: (p: Placement) => void) => void;
  remove: (id: string) => void;
  upload: (f: File) => Promise<string>;
  saveState: "idle" | "saving" | "saved";
  onSave: () => void;
  onClose: () => void;
  weeks: { id: string; title: string }[];
  currentId: string;
  onMoveWeek: (targetId: string) => void;
}) {
  const set = (mut: (p: Placement) => void) => update(id, mut);
  const stage = stageOf(p);
  const field = stage < STEPS.length ? STAGE_FIELD[stage] : null;
  const d = (p.data ?? {}) as NonNullable<Placement["data"]>;
  const c = (d.contract ?? {}) as Record<string, string>;
  const cset = (k: string) => (v: string) =>
    set((x) => {
      x.data ??= {};
      x.data.contract ??= {};
      x.data.contract[k] = v;
    });
  const [genBusy, setGenBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const creatives = d.creatives ?? [];
  async function genContract() {
    setGenBusy(true);
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.data?.contract ?? {}),
      });
      if (!res.ok) {
        alert("Не удалось сформировать договор");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Договор ${p.name || ""}.docx`.trim();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-2xl my-3 sm:my-6 rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 px-4 sm:px-6 py-4 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)] rounded-t-[var(--radius-xl)] pr-12">
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--color-surface)] hover:bg-[var(--color-line-soft)] flex items-center justify-center text-[var(--color-muted)] text-[18px]"
          >
            ×
          </button>
          <input
            value={p.name}
            onChange={(e) => set((x) => (x.name = e.target.value))}
            placeholder="Название канала / блогер"
            className="w-full bg-transparent text-[18px] font-semibold outline-none border-b border-transparent focus:border-[var(--color-accent)]"
          />
          <div className="text-[12px] text-[var(--color-muted)] mt-1">
            шаг {Math.min(stage + 1, STEPS.length)}/{STEPS.length} ·{" "}
            {stage >= STEPS.length ? "готово" : STEPS[stage]}
          </div>
        </header>

        <div className="p-4 sm:p-6 flex flex-col gap-5">
          {/* текущий шаг */}
          {field ? (
            <div className="rounded-[var(--radius-lg)] bg-[var(--color-accent-soft)] p-4">
              <div className="text-[12px] font-semibold text-[var(--color-accent-hover)] mb-1">
                Сейчас на шаге: {STEPS[stage]}
              </div>
              <p className="text-[13px] text-[var(--color-muted)]">{stageHint(field.key)}</p>
              <button
                onClick={() => set((x) => ((x.steps ??= {})[STEPS[stage]] = true))}
                className="mt-3 h-8 px-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-medium"
              >
                Шаг выполнен
              </button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] bg-[var(--color-green-soft)] p-4 text-[13px] text-[#2e7d32]">
              Все этапы пройдены.
            </div>
          )}

          {/* переход к аналитике после публикации */}
          {p.steps?.["Опубликовано"] && p.id && !p.id.startsWith("tmp-") && (
            <a
              href={`/results?open=pl-${p.id}`}
              className="flex items-center justify-center gap-2 h-10 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium"
            >
              Заполнить аналитику в «Результатах»
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          )}

          {/* что сейчас нужно */}
          <div>
            <Label>Что сейчас нужно</Label>
            <input
              value={d.now_needed ?? ""}
              onChange={(e) => set((x) => ((x.data ??= {}).now_needed = e.target.value))}
              placeholder="напр. ждём реквизиты от блогера / нужен апрув креатива"
              className="w-full bg-[var(--color-surface)] text-[14px] px-3 py-2 rounded-[var(--radius-lg)] border border-[var(--color-orange)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* бриф */}
          <Section title="Бриф">
            <FA label="Описание автора" v={p.author_desc} on={(v) => set((x) => (x.author_desc = v))} />
            <FA label="Аудитория" v={p.audience} on={(v) => set((x) => (x.audience = v))} />
            <FA label="Тематика поста" v={p.post_topic} on={(v) => set((x) => (x.post_topic = v))} />

            {/* ссылка на канал + авто-ссылка на статистику */}
            <div>
              <Label>Ссылка на канал</Label>
              <div className="flex items-center gap-2">
                <input
                  value={d.channel_link ?? ""}
                  onChange={(e) => set((x) => ((x.data ??= {}).channel_link = e.target.value))}
                  placeholder="https://t.me/channel"
                  className="flex-1 bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)]"
                />
                {d.channel_link && /^https?:/.test(d.channel_link) && (
                  <a
                    href={d.channel_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-[var(--color-accent)] hover:underline shrink-0"
                  >
                    открыть
                  </a>
                )}
              </div>
              {tgstatUrl(d.channel_link ?? "") && (
                <a
                  href={tgstatUrl(d.channel_link ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-1.5 h-7 px-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] text-[12px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="M7 15l3-4 3 3 4-6" />
                  </svg>
                  Статистика в TGStat
                </a>
              )}
            </div>

            {/* оффер — отдельной выделенной строкой */}
            <div className="rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30 p-3">
              <Label>Оффер</Label>
              <input
                value={p.offer}
                onChange={(e) => set((x) => (x.offer = e.target.value))}
                placeholder="Что предлагаем аудитории…"
                className="w-full bg-[var(--color-surface)] text-[14px] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] outline-none focus:border-[var(--color-accent-hover)]"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <Label>Дата (01.01.2001)</Label>
                <input
                  value={p.post_date}
                  onChange={(e) => set((x) => (x.post_date = e.target.value))}
                  placeholder="01.01.2001"
                  className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <F label="Ленд" v={p.landing} on={(v) => set((x) => (x.landing = v))} />
              <F label="UTM" v={p.utm} on={(v) => set((x) => (x.utm = v))} />
              <F label="Цена, ₽" v={p.price} on={(v) => set((x) => (x.price = v))} />
              <F label="Цена со скидкой" v={p.price_discount} on={(v) => set((x) => (x.price_discount = v))} />
              <F label="Прогноз охвата" v={p.forecast_reach} on={(v) => set((x) => (x.forecast_reach = v))} />
              <F label="Прогноз просмотров" v={p.avg_views} on={(v) => set((x) => (x.avg_views = v))} />
              <F label="Прогноз ER, %" v={p.err} on={(v) => set((x) => (x.err = v))} />
              <F label="Прогноз CPV" v={p.forecast_cpv} on={(v) => set((x) => (x.forecast_cpv = v))} />
            </div>
            <div>
              <Label>Рефералка</Label>
              <div className="flex flex-wrap gap-2">
                <Check
                  label="Готов на рефералку"
                  on={d.ref_ready}
                  toggle={() => set((x) => ((x.data ??= {}).ref_ready = !d.ref_ready))}
                />
                <Check
                  label="Зарегистрирован в рефералке"
                  on={d.ref_registered}
                  toggle={() => set((x) => ((x.data ??= {}).ref_registered = !d.ref_registered))}
                />
              </div>
            </div>
          </Section>

          {/* креатив: несколько вариантов (картинка + текст) + согласования */}
          <Section title="Креатив">
            {creatives.length === 0 && (
              <p className="text-[12px] text-[var(--color-faint)]">
                Добавь варианты креатива — картинку и текст. Картинку можно открыть на
                весь экран.
              </p>
            )}
            {creatives.map((cr, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <Label>Вариант {i + 1}</Label>
                  <button
                    onClick={() => set((x) => x.data?.creatives?.splice(i, 1))}
                    className="text-[12px] text-[var(--color-red)] hover:underline"
                  >
                    удалить
                  </button>
                </div>
                <CreativeImage
                  v={cr.image ?? ""}
                  upload={upload}
                  onChange={(v) =>
                    set((x) => {
                      x.data ??= {};
                      (x.data.creatives ??= [])[i] = { ...(x.data.creatives![i] ?? {}), image: v };
                    })
                  }
                  onZoom={() => cr.image && setLightbox(cr.image)}
                />
                <div className="mt-2">
                  <RichText
                    value={cr.text ?? ""}
                    placeholder="Текст поста / сценарий…"
                    history={cr.history ?? []}
                    onChange={(html) =>
                      set((x) => {
                        x.data ??= {};
                        (x.data.creatives ??= [])[i] = {
                          ...(x.data.creatives![i] ?? {}),
                          text: html,
                        };
                      })
                    }
                    onSnapshot={() =>
                      set((x) => {
                        x.data ??= {};
                        const arr = (x.data.creatives ??= []);
                        const v = arr[i] ?? {};
                        const hist = v.history ?? [];
                        const last = hist.length ? hist[hist.length - 1].text : null;
                        if ((v.text ?? "") && v.text !== last) {
                          arr[i] = {
                            ...v,
                            history: [...hist, { text: v.text ?? "", at: new Date().toISOString() }],
                          };
                        }
                      })
                    }
                    onRestore={(t) =>
                      set((x) => {
                        x.data ??= {};
                        const arr = (x.data.creatives ??= []);
                        arr[i] = { ...(arr[i] ?? {}), text: t };
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => set((x) => ((x.data ??= {}).creatives ??= []).push({}))}
              className="h-8 px-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] text-[13px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              + вариант креатива
            </button>
            <div>
              <Label>Согласования</Label>
              <div className="flex flex-wrap gap-2">
                <Check label="Согласование от Димы" on={d.approve_dima} toggle={() => set((x) => ((x.data ??= {}).approve_dima = !d.approve_dima))} />
                <Check label="Согласование от Даши" on={d.approve_dasha} toggle={() => set((x) => ((x.data ??= {}).approve_dasha = !d.approve_dasha))} />
                <Check label="Согласование от Лёши" on={d.approve_lesha} toggle={() => set((x) => ((x.data ??= {}).approve_lesha = !d.approve_lesha))} />
              </div>
            </div>

            {/* комментарии команды — сворачиваемые */}
            <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)]">
              <button
                onClick={() => setShowComments((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-[13px] font-medium hover:bg-[var(--color-surface-2)] rounded-[var(--radius-md)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--color-accent)]"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  Комментарии команды
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-[var(--color-muted)] transition-transform ${showComments ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showComments && (
                <div className="px-3 pb-3 flex flex-col gap-3">
                  {([
                    ["dasha", "Даша"],
                    ["dima", "Дима"],
                    ["lesha", "Лёша"],
                    ["ksyusha", "Ксюша"],
                    ["kristina", "Кристина"],
                  ] as const).map(([k, label]) => {
                    const dd = d as Record<string, unknown>;
                    return (
                      <PersonComment
                        key={k}
                        label={label}
                        text={(dd[`comment_${k}`] as string) ?? ""}
                        audios={(dd[`audio_${k}`] as string[]) ?? []}
                        upload={upload}
                        onText={(v) =>
                          set((x) => {
                            x.data ??= {};
                            (x.data as Record<string, unknown>)[`comment_${k}`] = v;
                          })
                        }
                        onAddAudio={(url) =>
                          set((x) => {
                            x.data ??= {};
                            const m = x.data as Record<string, string[]>;
                            (m[`audio_${k}`] ??= []).push(url);
                          })
                        }
                        onRemoveAudio={(i) =>
                          set((x) => {
                            const m = x.data as Record<string, string[]>;
                            m[`audio_${k}`]?.splice(i, 1);
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          {/* договор — автосборка по реквизитам блогера */}
          <Section title="Договор">
            <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
              <F label="ФИО полностью" v={c.fio ?? ""} on={cset("fio")} />
              <F label="ФИО для подписи (Иванов И.И.)" v={c.fio_short ?? ""} on={cset("fio_short")} />
              <F label="Статус (самозанятый / ИП)" v={c.status ?? ""} on={cset("status")} />
              <F label="ИНН" v={c.inn ?? ""} on={cset("inn")} />
              <F label="СНИЛС" v={c.snils ?? ""} on={cset("snils")} />
              <F label="Банк" v={c.bank ?? ""} on={cset("bank")} />
              <F label="БИК" v={c.bik ?? ""} on={cset("bik")} />
              <F label="Корр. счёт" v={c.korr ?? ""} on={cset("korr")} />
              <F label="Расчётный счёт" v={c.rs ?? ""} on={cset("rs")} />
              <F label="Телефон" v={c.phone ?? ""} on={cset("phone")} />
              <F label="Email" v={c.email ?? ""} on={cset("email")} />
              <F label="Канал (ссылка)" v={c.channel ?? ""} on={cset("channel")} />
              <F label="Формат (пост)" v={c.format ?? ""} on={cset("format")} />
              <F label="Дата публикации" v={c.pub_date ?? ""} on={cset("pub_date")} />
              <F label="Сроки / длительность" v={c.duration ?? ""} on={cset("duration")} />
              <F label="Сумма, ₽ (число)" v={c.price_num ?? ""} on={cset("price_num")} />
              <F label="Сумма прописью" v={c.price_words ?? ""} on={cset("price_words")} />
              <F label="Город договора" v={c.place ?? ""} on={cset("place")} />
              <F label="Дата договора" v={c.contract_date ?? ""} on={cset("contract_date")} />
            </div>
            <button
              onClick={genContract}
              disabled={genBusy}
              className="mt-3 h-9 px-4 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium disabled:opacity-60"
            >
              {genBusy ? "Собираю…" : "Сформировать договор (.docx)"}
            </button>
          </Section>

          {/* маркировка через Click.ru */}
          <Section title="Маркировка (Click.ru)">
            <F label="erid (из Click.ru)" v={d.erid ?? ""} on={(v) => set((x) => ((x.data ??= {}).erid = v))} />
            <CopyField label="Промаркированная ссылка" value={markedLink(p.landing, d.erid ?? "")} />
            <CopyField label="Текст-плашка «Реклама»" value={disclosure(d.erid ?? "")} />
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-line)] p-3 text-[12px] text-[var(--color-muted)] leading-relaxed">
              <div className="text-[11px] text-[var(--color-faint)] mb-1">Данные для мастера Click.ru:</div>
              Рекламодатель: ООО «Кайтен Софтвер», ИНН 7714426252, ОГРН 1187746341804
              <br />
              Площадка / канал: {c.channel || p.landing || "—"} · Формат: {c.format || "пост"}
              <br />
              Договор: {c.contract_date || "—"} · Креатив:{" "}
              {creatives.length
                ? `${creatives.length} вар.`
                : d.creative_text || d.creative_image
                  ? "есть"
                  : "—"}
            </div>
            <Check
              label="Отчёт в ОРД за месяц сдан"
              on={d.ord_report_done}
              toggle={() => set((x) => ((x.data ??= {}).ord_report_done = !d.ord_report_done))}
            />
          </Section>

          {/* все артефакты этапов */}
          <Section title="Артефакты по этапам">
            <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
              <F label="Данные договора" v={d.contract_data ?? ""} on={(v) => set((x) => ((x.data ??= {}).contract_data = v))} />
              <FF label="Файл договора" v={d.contract_file ?? ""} on={(v) => set((x) => ((x.data ??= {}).contract_file = v))} upload={upload} />
              <F label="Счёт / оплата" v={d.payment ?? ""} on={(v) => set((x) => ((x.data ??= {}).payment = v))} />
              <F label="Маркировка (ERID)" v={d.erid ?? ""} on={(v) => set((x) => ((x.data ??= {}).erid = v))} />
              <F label="Ссылка на пост" v={d.post_link ?? ""} on={(v) => set((x) => ((x.data ??= {}).post_link = v))} />
              <F label="Аналитика" v={d.analytics_link ?? ""} on={(v) => set((x) => ((x.data ??= {}).analytics_link = v))} />
            </div>
            <FA label="Заметка" v={d.note ?? ""} on={(v) => set((x) => ((x.data ??= {}).note = v))} />
          </Section>


          {/* чеклист этапов */}
          <Section title="Этапы">
            <div className="flex flex-wrap gap-1.5">
              {STEPS.map((s, i) => {
                const ok = !!p.steps?.[s];
                return (
                  <button
                    key={s}
                    onClick={() => set((x) => ((x.steps ??= {})[s] = !ok))}
                    className={[
                      "text-[11px] px-2 py-1 rounded-[var(--radius-md)] border transition-colors",
                      ok
                        ? "bg-[var(--color-green-soft)] border-[var(--color-green-soft)] text-[#2e7d32]"
                        : "bg-[var(--color-surface-2)] border-[var(--color-line-soft)] text-[var(--color-faint)]",
                    ].join(" ")}
                  >
                    {i + 1}. {s}
                  </button>
                );
              })}
            </div>
          </Section>

          {weeks.length > 1 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[12px] text-[var(--color-faint)]">Перенести в неделю:</span>
              <select
                value={currentId}
                onChange={(e) => onMoveWeek(e.target.value)}
                className="text-[13px] px-2 py-1 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] outline-none focus:border-[var(--color-accent)]"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                if (confirm(`Удалить размещение «${p.name}»?`)) remove(id);
              }}
              className="text-[13px] text-[var(--color-red)] hover:underline"
            >
              удалить размещение
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-faint)]">
                {saveState === "saving"
                  ? "сохраняю…"
                  : saveState === "saved"
                    ? "✓ сохранено"
                    : ""}
              </span>
              <button
                onClick={onSave}
                disabled={saveState === "saving"}
                className="h-9 px-5 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium disabled:opacity-60"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="креатив" className="max-w-full max-h-full object-contain" />
          <button
            aria-label="Закрыть"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white text-[20px] leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── поля ───────── */
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-[var(--color-faint)] mb-1">{children}</div>;
}
function F({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={v}
        onChange={(e) => on(e.target.value)}
        className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)]"
      />
    </div>
  );
}
function FA({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={v}
        onChange={(e) => on(e.target.value)}
        rows={2}
        className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] resize-y"
      />
    </div>
  );
}
// поле со ссылкой/значением + кнопкой загрузки файла
function FileField({
  v,
  on,
  upload,
}: {
  v: string;
  on: (v: string) => void;
  upload?: (f: File) => Promise<string>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        value={v}
        onChange={(e) => on(e.target.value)}
        placeholder="ссылка или значение"
        className="flex-1 bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)]"
      />
      {v && /^https?:/.test(v) && (
        <a href={v} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--color-accent)] hover:underline">
          открыть
        </a>
      )}
      {upload && (
        <>
          <button
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="text-[12px] px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            {busy ? "…" : "файл"}
          </button>
          <input
            ref={ref}
            type="file"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setBusy(true);
                on(await upload(f));
                setBusy(false);
              }
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
// редактор текста с форматированием (жирный/курсив/ссылки) + разворот на весь экран
function RichText({
  value,
  onChange,
  placeholder,
  history = [],
  onSnapshot,
  onRestore,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  history?: { text: string; at: string }[];
  onSnapshot?: () => void;
  onRestore?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [showHist, setShowHist] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || "")) el.innerHTML = value || "";
  }, [value, full]);
  const push = () => onChange(ref.current?.innerHTML || "");
  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    push();
  };
  const link = () => {
    const url = window.prompt("Ссылка (URL):", "https://");
    if (url) exec("createLink", url);
  };
  const toolbar = (
    <div className="flex items-center gap-2 mb-1.5">
      <div className="flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] border border-[var(--color-line-soft)]">
        <TB title="Жирный" onClick={() => exec("bold")} className="font-bold">
          Ж
        </TB>
        <TB title="Курсив" onClick={() => exec("italic")} className="italic">
          К
        </TB>
        <TB title="Ссылка" onClick={link}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </TB>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {(onSnapshot || history.length > 0) && (
          <PillBtn active={showHist} onClick={() => setShowHist((s) => !s)} title="История версий">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5" />
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
              <path d="M12 7v5l3 2" />
            </svg>
            История
            {history.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[var(--color-accent-soft)] text-[10px] text-[var(--color-accent-hover)]">
                {history.length}
              </span>
            )}
          </PillBtn>
        )}
        <PillBtn onClick={() => setFull((f) => !f)} title={full ? "Свернуть" : "Развернуть"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {full ? (
              <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" />
            ) : (
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            )}
          </svg>
          {full ? "Свернуть" : "Развернуть"}
        </PillBtn>
      </div>
    </div>
  );

  const histPanel = showHist && (
    <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2 max-h-48 overflow-auto">
      {history.length === 0 ? (
        <div className="text-[12px] text-[var(--color-faint)]">
          Версий пока нет. Жми «Сохранить» в развёрнутом окне — будет сохраняться версия.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {[...history].reverse().map((h, i) => (
            <button
              key={i}
              onClick={() => {
                onRestore?.(h.text);
                setShowHist(false);
              }}
              className="text-left px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface)] border border-transparent hover:border-[var(--color-line)]"
            >
              <div className="text-[11px] text-[var(--color-faint)]">
                {new Date(h.at).toLocaleString("ru-RU")} · восстановить
              </div>
              <div className="text-[12px] text-[var(--color-muted)] line-clamp-1">
                {h.text.replace(/<[^>]+>/g, " ").slice(0, 70) || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const editor = (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={push}
      data-ph={placeholder}
      className={[
        "rich w-full bg-[var(--color-surface)] text-[13px] leading-relaxed px-2.5 py-2 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] overflow-auto whitespace-pre-wrap",
        full ? "min-h-[60vh]" : "min-h-[120px] max-h-[320px]",
      ].join(" ")}
    />
  );
  if (full) {
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
        onClick={() => setFull(false)}
      >
        <div
          className="w-full max-w-2xl my-6 bg-[var(--color-surface)] rounded-[var(--radius-xl)] p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {toolbar}
          {histPanel}
          {editor}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={() => setFull(false)}
              className="text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              закрыть
            </button>
            <button
              onClick={() => {
                onSnapshot?.();
                setFull(false);
              }}
              className="h-9 px-5 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      {toolbar}
      {histPanel}
      {editor}
    </div>
  );
}
function TB({
  children,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 rounded-[6px] flex items-center justify-center text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface)] ${className}`}
    >
      {children}
    </button>
  );
}
function PillBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)] border text-[12px] font-medium transition-colors",
        active
          ? "bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
          : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// картинка креатива: превью + загрузка/замена
function CreativeImage({
  v,
  onChange,
  upload,
  onZoom,
}: {
  v: string;
  onChange: (v: string) => void;
  upload: (f: File) => Promise<string>;
  onZoom?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const on = onChange;
  return (
    <div>
      <Label>Картинка</Label>
      {v ? (
        <div className="relative group inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={v}
            alt="креатив"
            onClick={onZoom}
            className="max-h-64 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] cursor-zoom-in"
          />
          <button
            onClick={onZoom}
            className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded bg-black/60 text-white"
          >
            ⛶ на весь экран
          </button>
          <button
            onClick={() => on("")}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-[15px] leading-none"
            aria-label="Удалить"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="w-full aspect-[16/9] max-w-md rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] text-[13px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          {busy ? "загрузка…" : "+ загрузить картинку"}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            setBusy(true);
            on(await upload(f));
            setBusy(false);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

// коммент одного человека: текст + голосовые записи
function PersonComment({
  label,
  text,
  audios,
  upload,
  onText,
  onAddAudio,
  onRemoveAudio,
}: {
  label: string;
  text: string;
  audios: string[];
  upload: (f: File) => Promise<string>;
  onText: (v: string) => void;
  onAddAudio: (url: string) => void;
  onRemoveAudio: (i: number) => void;
}) {
  return (
    <div className="border-l-2 border-[var(--color-line)] pl-3">
      <div className="flex items-center justify-between mb-1">
        <Label>{label}</Label>
        <VoiceRecorder upload={upload} onRecorded={onAddAudio} />
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        placeholder="текст коммента…"
        className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] resize-y"
      />
      {audios.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {audios.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <audio controls src={url} className="h-8 flex-1" />
              <button
                onClick={() => onRemoveAudio(i)}
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)] text-[15px] leading-none hover:bg-[var(--color-line-soft)]"
                aria-label="Удалить запись"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// запись голоса через микрофон → загрузка в Storage
function VoiceRecorder({
  upload,
  onRecorded,
}: {
  upload: (f: File) => Promise<string>;
  onRecorded: (url: string) => void;
}) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      mr.current = m;
      chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        setBusy(true);
        const url = await upload(file);
        setBusy(false);
        if (url) onRecorded(url);
      };
      m.start();
      setRec(true);
    } catch {
      alert("Не удалось включить микрофон — разреши доступ в браузере.");
    }
  }
  function stop() {
    mr.current?.stop();
    setRec(false);
  }

  return (
    <button
      onClick={rec ? stop : start}
      disabled={busy}
      className={[
        "text-[12px] px-2.5 py-1 rounded-[var(--radius-md)] border transition-colors disabled:opacity-50",
        rec
          ? "bg-[var(--color-red-soft)] border-[var(--color-red-soft)] text-[#b3261e]"
          : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]",
      ].join(" ")}
    >
      {busy ? "…" : rec ? "⏺ стоп" : "🎤 записать"}
    </button>
  );
}

// сборка промаркированной ссылки и текста-плашки
function markedLink(landing: string, erid: string): string {
  if (!erid) return "";
  if (!landing) return `erid: ${erid}`;
  const sep = landing.includes("?") ? "&" : "?";
  return `${landing}${sep}erid=${encodeURIComponent(erid)}`;
}
function disclosure(erid: string): string {
  if (!erid) return "";
  return `Реклама. ООО «Кайтен Софтвер», ИНН 7714426252. erid: ${erid}`;
}

// поле «только чтение» с кнопкой «копировать»
function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] break-all">
          {value || <span className="text-[var(--color-faint)]">—</span>}
        </div>
        <button
          onClick={() => {
            if (!value) return;
            navigator.clipboard?.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          disabled={!value}
          className="shrink-0 px-3 rounded-[var(--radius-md)] border border-[var(--color-line)] text-[12px] text-[var(--color-muted)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {done ? "✓" : "копир."}
        </button>
      </div>
    </div>
  );
}

// галочка-чекбокс
function Check({ label, on, toggle }: { label: string; on?: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className={[
        "flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border text-[13px] transition-colors",
        on
          ? "bg-[var(--color-green-soft)] border-[var(--color-green-soft)] text-[#2e7d32]"
          : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex items-center justify-center w-4 h-4 rounded-[4px] border text-[11px] leading-none",
          on ? "bg-[var(--color-green)] border-[var(--color-green)] text-white" : "border-[var(--color-line)]",
        ].join(" ")}
      >
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

// FileField с подписью
function FF(props: { label: string; v: string; on: (v: string) => void; upload: (f: File) => Promise<string> }) {
  return (
    <div>
      <Label>{props.label}</Label>
      <FileField v={props.v} on={props.on} upload={props.upload} />
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface-2)] border border-[var(--color-line-soft)] p-4">
      <div className="text-[13px] font-semibold mb-3">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function WeekPicker({
  weeks,
  wi,
  onPick,
}: {
  weeks: Sprint[];
  wi: number;
  onPick: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = weeks[wi];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-10 pl-3.5 pr-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] transition-colors"
      >
        <span className="text-[15px] font-semibold text-[var(--color-ink)]">{cur.title}</span>
        <span className="text-[13px] text-[var(--color-muted)] tabular-nums">
          {weekRange(cur.date_from, cur.date_to)}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 left-0 min-w-[240px] max-h-[320px] overflow-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.10)] p-1">
          {weeks.map((w, i) => (
            <button
              key={w.id}
              onClick={() => {
                onPick(i);
                setOpen(false);
              }}
              className={[
                "w-full flex items-center justify-between gap-4 px-3 py-2 rounded-[var(--radius-md)] text-left transition-colors",
                i === wi
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]"
                  : "hover:bg-[var(--color-surface-2)]",
              ].join(" ")}
            >
              <span className="text-[14px] font-medium">{w.title}</span>
              <span
                className={[
                  "text-[12px] tabular-nums",
                  i === wi ? "text-[var(--color-accent-hover)]" : "text-[var(--color-faint)]",
                ].join(" ")}
              >
                {weekRange(w.date_from, w.date_to)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// единый сегмент: дата + статус. Опубликовано → без просрочки.
function DatePill({ s, published }: { s: string; published?: boolean }) {
  const d = parseDate(s);
  if (!d) {
    return (
      <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
        Дата согласуется
      </span>
    );
  }
  const datePill = (
    <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium bg-[var(--color-surface-2)] text-[var(--color-ink)] tabular-nums">
      {fmtDate(s)}
    </span>
  );
  if (published) {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        {datePill}
        <span
          className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: DUE_COLORS.green.bg, color: DUE_COLORS.green.fg }}
        >
          опубликовано
        </span>
      </span>
    );
  }
  const due = dueInfo(s);
  if (!due) return datePill;
  const c = DUE_COLORS[due.cls];
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {datePill}
      <span
        className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium"
        style={{ background: c.bg, color: c.fg }}
      >
        {due.label}
      </span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[12px] text-[var(--color-muted)]">{label}</div>
      <div className="text-[20px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(Math.round(n));
}

// строка для записи в Supabase
function rowOf(p: Placement) {
  return {
    name: p.name,
    author_desc: p.author_desc ?? "",
    audience: p.audience ?? "",
    post_date: p.post_date ?? "",
    post_topic: p.post_topic ?? "",
    offer: p.offer ?? "",
    creative: p.creative ?? "",
    landing: p.landing ?? "",
    utm: p.utm ?? "",
    price: p.price ?? "",
    price_discount: p.price_discount ?? "",
    subscribers: p.subscribers ?? "",
    avg_views: p.avg_views ?? "",
    err: p.err ?? "",
    forecast_reach: p.forecast_reach ?? "",
    forecast_cpv: p.forecast_cpv ?? "",
    steps: p.steps ?? {},
    data: p.data ?? {},
    updated_at: new Date().toISOString(),
  };
}
