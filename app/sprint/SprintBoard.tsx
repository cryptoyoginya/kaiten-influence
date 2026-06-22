"use client";

import { useMemo, useRef, useState } from "react";
import type { Sprint, Placement } from "@/lib/data";
import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/client";

const STEPS = [
  "Креатив согл. Кайтен",
  "Креатив согл. автор",
  "Данные договора",
  "Договор составлен",
  "Договор подписан",
  "Счёт оплачен",
  "Маркировка готова",
  "Маркировка нанесена",
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
function stageOf(p: Placement): number {
  for (let i = 0; i < STEPS.length; i++) if (!p.steps?.[STEPS[i]]) return i;
  return STEPS.length;
}
function doneCount(p: Placement): number {
  return STEPS.filter((s) => p.steps?.[s]).length;
}

export default function SprintBoard({ sprint }: { sprint: Sprint }) {
  const [items, setItems] = useState<Placement[]>(sprint.placements);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const supabase = useMemo(() => (SUPABASE_ENABLED ? createClient() : null), []);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const econ = useMemo(() => {
    const spent = items.reduce((a, p) => a + num(p.price_discount || p.price), 0);
    const reach = items.reduce((a, p) => a + num(p.forecast_reach), 0);
    return { spent, reach, count: items.length };
  }, [items]);

  function scheduleSave(p: Placement) {
    if (!supabase || !p.id) return;
    clearTimeout(timers.current[p.id]);
    timers.current[p.id] = setTimeout(() => {
      supabase.from("placements").update(rowOf(p)).eq("id", p.id!).then(() => {});
    }, 500);
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
    const blank: Placement = {
      name: "Новое размещение",
      author_desc: "", audience: "", post_date: "", post_topic: "", offer: "",
      creative: "", landing: "", utm: "", price: "", price_discount: "",
      subscribers: "", avg_views: "", err: "", forecast_reach: "", forecast_cpv: "",
      steps: {}, data: {},
    };
    if (supabase) {
      const { data, error } = await supabase
        .from("placements")
        .insert({ ...rowOf(blank), sprint_id: sprint.id })
        .select()
        .single();
      if (!error && data) blank.id = data.id;
    } else {
      blank.id = "local-" + Date.now();
    }
    setItems((prev) => [blank, ...prev]);
    setOpenId(blank.id ?? blank.name);
  }

  async function remove(id: string) {
    const p = items.find((x) => (x.id ?? x.name) === id);
    if (supabase && p?.id) await supabase.from("placements").delete().eq("id", p.id);
    setItems((prev) => prev.filter((x) => (x.id ?? x.name) !== id));
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
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">
            Спринт · {sprint.title}
          </h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            {sprint.date_from} — {sprint.date_to} · {econ.count} размещений · бюджет{" "}
            {fmt(econ.spent)} ₽ · прогноз охвата {fmtShort(econ.reach)}
          </p>
        </div>
        <button
          onClick={create}
          className="h-9 px-4 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium"
        >
          + размещение
        </button>
      </div>

      <p className="text-[12px] text-[var(--color-faint)] mb-2">
        Перетаскивай карточки между этапами. Клик — открыть и заполнить артефакт текущего шага.
      </p>

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
                      onOpen={() => setOpenId(p.id ?? p.name)}
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
          onClose={() => setOpenId(null)}
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
  const filled = field ? !!p.data?.[field.key] : true;
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("id", p.id ?? p.name)}
      onClick={onOpen}
      className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5 cursor-pointer hover:border-[var(--color-accent)]"
    >
      <div className="text-[13px] font-medium leading-snug">{p.name || "—"}</div>
      <div className="text-[11px] text-[var(--color-muted)] mt-1">{p.post_date || "—"}</div>
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
  onClose,
}: {
  p: Placement;
  id: string;
  update: (id: string, mut: (p: Placement) => void) => void;
  remove: (id: string) => void;
  upload: (f: File) => Promise<string>;
  onClose: () => void;
}) {
  const set = (mut: (p: Placement) => void) => update(id, mut);
  const stage = stageOf(p);
  const field = stage < STEPS.length ? STAGE_FIELD[stage] : null;
  const d = (p.data ?? {}) as NonNullable<Placement["data"]>;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-2xl my-6 rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)] rounded-t-[var(--radius-xl)] pr-12">
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

        <div className="p-6 flex flex-col gap-5">
          {/* текущий шаг */}
          {field ? (
            <div className="rounded-[var(--radius-lg)] bg-[var(--color-accent-soft)] p-4">
              <div className="text-[12px] font-semibold text-[var(--color-accent-hover)] mb-1">
                Сейчас на шаге: {STEPS[stage]}
              </div>
              <Label>{field.label}</Label>
              <FileField
                v={d[field.key] ?? ""}
                on={(v) => set((x) => ((x.data ??= {})[field.key] = v))}
                upload={field.file ? upload : undefined}
              />
              <button
                onClick={() => set((x) => ((x.steps ??= {})[STEPS[stage]] = true))}
                className="mt-3 h-8 px-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-medium"
              >
                Шаг выполнен →
              </button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] bg-[var(--color-green-soft)] p-4 text-[13px] text-[#2e7d32]">
              Все этапы пройдены. Итоги — на вкладке «Результаты».
            </div>
          )}

          {/* бриф */}
          <Section title="Бриф">
            <FA label="Описание автора" v={p.author_desc} on={(v) => set((x) => (x.author_desc = v))} />
            <FA label="Аудитория" v={p.audience} on={(v) => set((x) => (x.audience = v))} />
            <FA label="Тематика поста" v={p.post_topic} on={(v) => set((x) => (x.post_topic = v))} />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              <F label="Дата" v={p.post_date} on={(v) => set((x) => (x.post_date = v))} />
              <F label="Оффер" v={p.offer} on={(v) => set((x) => (x.offer = v))} />
              <F label="Ленд" v={p.landing} on={(v) => set((x) => (x.landing = v))} />
              <F label="UTM" v={p.utm} on={(v) => set((x) => (x.utm = v))} />
              <F label="Цена, ₽" v={p.price} on={(v) => set((x) => (x.price = v))} />
              <F label="Цена со скидкой" v={p.price_discount} on={(v) => set((x) => (x.price_discount = v))} />
              <F label="Прогноз охвата" v={p.forecast_reach} on={(v) => set((x) => (x.forecast_reach = v))} />
              <F label="Прогноз CPV" v={p.forecast_cpv} on={(v) => set((x) => (x.forecast_cpv = v))} />
            </div>
          </Section>

          {/* все артефакты этапов */}
          <Section title="Артефакты по этапам">
            <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
              <FF label="Креатив" v={d.creative ?? ""} on={(v) => set((x) => ((x.data ??= {}).creative = v))} upload={upload} />
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

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                if (confirm(`Удалить размещение «${p.name}»?`)) remove(id);
              }}
              className="text-[13px] text-[var(--color-red)] hover:underline"
            >
              удалить размещение
            </button>
            <span className="text-[12px] text-[var(--color-faint)]">
              {SUPABASE_ENABLED ? "сохраняется для команды" : "локально"}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-line-soft)] flex items-center justify-center text-[var(--color-muted)] text-[18px]"
        >
          ×
        </button>
      </div>
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
