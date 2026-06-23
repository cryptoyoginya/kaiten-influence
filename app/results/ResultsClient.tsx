"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Integration } from "@/lib/data";
import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/client";

const LS_KEY = "kaiten-integrations-v1";

type Override = { published: boolean; result: Integration["result"] };

export default function ResultsClient({ seed }: { seed: Integration[] }) {
  const [items, setItems] = useState<Integration[]>(seed);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => (SUPABASE_ENABLED ? createClient() : null), []);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // localStorage — только фолбэк, когда Supabase не подключён
  useEffect(() => {
    if (SUPABASE_ENABLED) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const ov = JSON.parse(raw) as Record<string, Override>;
      setItems(
        seed.map((it) =>
          ov[it.id]
            ? {
                ...it,
                published: ov[it.id].published ?? it.published,
                result: { ...it.result, ...ov[it.id].result },
              }
            : it
        )
      );
    } catch {
      /* пусто */
    }
  }, [seed]);

  function saveLocal(next: Integration[]) {
    const map: Record<string, Override> = {};
    next.forEach((it) => (map[it.id] = { published: it.published, result: it.result }));
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map));
    } catch {
      /* квота */
    }
  }

  function rowOf(it: Integration) {
    return {
      brief: it.brief,
      result: it.result,
      published: it.published,
      updated_at: new Date().toISOString(),
    };
  }

  function scheduleSave(it: Integration) {
    if (!supabase) return;
    clearTimeout(timers.current[it.id]);
    setSaving(true);
    timers.current[it.id] = setTimeout(async () => {
      await supabase.from("integrations").update(rowOf(it)).eq("id", it.id);
      setSaving(false);
    }, 500);
  }

  async function saveNow(it: Integration) {
    if (!supabase) return;
    clearTimeout(timers.current[it.id]);
    setSaving(true);
    await supabase.from("integrations").update(rowOf(it)).eq("id", it.id);
    setSaving(false);
  }

  // загрузка картинки: в Supabase Storage (вернёт URL) либо base64-фолбэк
  async function uploadImage(id: string, file: File): Promise<string> {
    if (!supabase) return readImage(file);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("screens")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) return readImage(file);
    return supabase.storage.from("screens").getPublicUrl(path).data.publicUrl;
  }

  function update(id: string, mut: (it: Integration) => void) {
    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== id) return it;
        const copy: Integration = structuredClone(it);
        mut(copy);
        applyDerived(copy);
        return copy;
      });
      const changed = next.find((i) => i.id === id);
      if (changed) {
        if (supabase) scheduleSave(changed);
        else saveLocal(next);
      }
      return next;
    });
  }

  const open = useMemo(() => items.find((i) => i.id === openId) ?? null, [items, openId]);
  const live = items.filter((i) => i.published).length;

  // закрытие по Esc
  useEffect(() => {
    if (!openId) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openId]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-tight mb-3">
          Результаты интеграций
        </h1>
        <div className="grid grid-cols-3 gap-3 max-w-lg">
          <RStat label="Интеграций" value={items.length} />
          <RStat label="Вышло" value={live} accent />
          <RStat label="В работе" value={items.length - live} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setOpenId(it.id)}
            className="text-left rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)] hover:shadow-[0_1px_8px_rgba(125,76,207,0.08)] transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-[15px] leading-snug">{it.name}</div>
              <Status published={it.published} />
            </div>
            <div className="text-[12px] text-[var(--color-muted)] mt-1 flex flex-wrap gap-x-1.5">
              {it.niche && <span>{it.niche} ·</span>}
              {fmtDate(it.date) ? (
                <span className="tabular-nums">{fmtDate(it.date)}</span>
              ) : (
                <span className="text-[var(--color-faint)]">без даты</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Mini label="CPV план" v={it.plan.cpv} />
              <Mini label="ROMI" v={it.result.unit.romi} accent />
              <Mini label="Выручка" v={it.result.conversion.revenue} />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Progress pct={fillPercent(it)} />
              {it.result.lessons.verdict ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]">
                  {it.result.lessons.verdict}
                </span>
              ) : (
                <span className="text-[12px] text-[var(--color-accent)]">заполнить →</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {open && (
        <Modal onClose={() => setOpenId(null)}>
          <Editor
            it={open}
            update={update}
            upload={(f) => uploadImage(open.id, f)}
            saving={saving}
            onSave={() => saveNow(open)}
          />
        </Modal>
      )}
    </div>
  );
}

function RStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={[
        "rounded-[var(--radius-xl)] border px-4 py-3",
        accent
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)]",
      ].join(" ")}
    >
      <div className="text-[12px] text-[var(--color-muted)]">{label}</div>
      <div
        className={[
          "text-[22px] font-semibold mt-0.5 tabular-nums",
          accent ? "text-[var(--color-accent-hover)]" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

/* ============ модалка ============ */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-6 rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-line-soft)] flex items-center justify-center text-[var(--color-muted)] text-[18px] leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* ============ редактор ============ */

function Editor({
  it,
  update,
  upload,
  saving,
  onSave,
}: {
  it: Integration;
  update: (id: string, mut: (it: Integration) => void) => void;
  upload: (file: File) => Promise<string>;
  saving: boolean;
  onSave: () => void;
}) {
  const r = it.result;
  const set = (mut: (it: Integration) => void) => update(it.id, mut);

  return (
    <div>
      {/* шапка */}
      <header className="px-6 py-5 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)] rounded-t-[var(--radius-xl)]">
        <div className="flex items-center gap-3 pr-8">
          <h2 className="text-[19px] font-semibold">{it.name}</h2>
          <button
            onClick={() => set((d) => (d.published = !d.published))}
            className="shrink-0"
            title="переключить статус"
          >
            <Status published={it.published} />
          </button>
        </div>
        <div className="text-[12px] text-[var(--color-muted)] mt-1 flex flex-wrap gap-x-3">
          {it.niche && <span>{it.niche}</span>}
          <span>дата: {fmtDate(it.date) || "без даты"}</span>
          {it.landing && (
            <a href={it.landing} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
              лендинг
            </a>
          )}
        </div>
        <div className="mt-3">
          <Label>Ссылка на пост</Label>
          <Txt v={r.post_link} onChange={(v) => set((d) => (d.result.post_link = v))} placeholder="https://t.me/…" />
        </div>
      </header>

      <div className="p-6 flex flex-col gap-5">
        {/* бриф размещения — все данные карточки */}
        <Block title="Бриф размещения">
          <div className="grid gap-y-3">
            <FA label="Описание автора" v={it.brief.author_desc} on={(v) => set((d) => (d.brief.author_desc = v))} />
            <FA label="Аудитория" v={it.brief.audience} on={(v) => set((d) => (d.brief.audience = v))} />
            <FA label="Тематика поста" v={it.brief.post_topic} on={(v) => set((d) => (d.brief.post_topic = v))} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 mt-3">
            <F label="Дата" v={it.brief.date} on={(v) => set((d) => (d.brief.date = v))} />
            <F label="Оффер" v={it.brief.offer} on={(v) => set((d) => (d.brief.offer = v))} />
            <F label="Креос" v={it.brief.creative} on={(v) => set((d) => (d.brief.creative = v))} />
            <F label="Ленд" v={it.brief.landing} on={(v) => set((d) => (d.brief.landing = v))} />
            <F label="UTM" v={it.brief.utm} on={(v) => set((d) => (d.brief.utm = v))} />
          </div>
        </Block>

        {/* план → факт (факт считается из введённого) */}
        <Block title="План → факт" accent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PlanFact label="Охват" plan={it.plan.reach} fact={r.reach.reach} />
            <PlanFact label="Просмотры" plan={it.plan.views} fact={r.reach.views} />
            <PlanFact label="ER, %" plan={it.plan.err} fact={r.reach.er} />
            <PlanFact label="CPV, ₽" plan={it.plan.cpv} fact={r.unit.cpv} />
          </div>
        </Block>

        <div className="grid lg:grid-cols-2 gap-5">
          <Block title="Затраты">
            <Grid>
              <F label="Цена размещения" hint={it.plan.price} v={r.costs.price} on={(v) => set((d) => (d.result.costs.price = v))} />
              <F label="Маркировка" v={r.costs.marking} on={(v) => set((d) => (d.result.costs.marking = v))} />
              <F label="Налог / комиссия" v={r.costs.tax} on={(v) => set((d) => (d.result.costs.tax = v))} />
              <ReadF label="Итого затрат, ₽" v={r.costs.total} />
            </Grid>
          </Block>

          <Block title="Охват и вовлечение — вводишь сырые числа">
            <Grid>
              <F label="Просмотры" v={r.reach.views} on={(v) => set((d) => (d.result.reach.views = v))} />
              <F label="Охват" v={r.reach.reach} on={(v) => set((d) => (d.result.reach.reach = v))} />
              <F label="Лайки / реакции" v={r.reach.likes} on={(v) => set((d) => (d.result.reach.likes = v))} />
              <F label="Репосты" v={r.reach.reposts} on={(v) => set((d) => (d.result.reach.reposts = v))} />
              <F label="Комментарии" v={r.reach.comments_count} on={(v) => set((d) => (d.result.reach.comments_count = v))} />
              <ReadF label="ER, %" v={r.reach.er} />
            </Grid>
          </Block>

          <Block title="Переходы и конверсия">
            <Grid>
              <F label="Переходы по ссылке" v={r.conversion.clicks} on={(v) => set((d) => (d.result.conversion.clicks = v))} />
              <F label="Лиды / регистрации" v={r.conversion.registrations} on={(v) => set((d) => (d.result.conversion.registrations = v))} />
              <F label="Активации" v={r.conversion.activations} on={(v) => set((d) => (d.result.conversion.activations = v))} />
              <F label="Платящие" v={r.conversion.paying} on={(v) => set((d) => (d.result.conversion.paying = v))} />
              <F label="Выручка, ₽" v={r.conversion.revenue} on={(v) => set((d) => (d.result.conversion.revenue = v))} />
            </Grid>
          </Block>

          <Block title="Юнит-экономика — считается автоматически">
            <Grid>
              <ReadF label="CPV, ₽" v={r.unit.cpv} />
              <ReadF label="CPM, ₽" v={r.unit.cpm} />
              <ReadF label="CTR, %" v={r.unit.ctr} />
              <ReadF label="CPL (за лид), ₽" v={r.unit.cpl} />
              <ReadF label="CAC (за платящего), ₽" v={r.unit.cac} />
              <ReadF label="ROMI, %" v={r.unit.romi} accent />
            </Grid>
            <div className="mt-3">
              <Label>Окупаемость (вывод словами)</Label>
              <Txt v={r.unit.payback} onChange={(v) => set((d) => (d.result.unit.payback = v))} placeholder="напр. окупилась за 3 недели" />
            </div>
          </Block>
        </div>

        {/* скрины */}
        <Block title="Скриншоты">
          <div className="grid md:grid-cols-2 gap-4">
            <ImgOne label="Креатив" value={r.screens.creative} upload={upload} onChange={(v) => set((d) => (d.result.screens.creative = v))} />
            <ImgOne label="Статистика поста" value={r.screens.stats} upload={upload} onChange={(v) => set((d) => (d.result.screens.stats = v))} />
          </div>
          <div className="mt-4">
            <Label>Скрины комментов</Label>
            <Gallery
              imgs={r.screens.comments}
              upload={upload}
              onAdd={(url) => set((d) => d.result.screens.comments.push(url))}
              onRemove={(i) => set((d) => d.result.screens.comments.splice(i, 1))}
            />
          </div>
        </Block>

        {/* выводы */}
        <Block title="Чему научились">
          <div className="grid lg:grid-cols-3 gap-4">
            <Note label="Что сработало" tone="green" v={r.lessons.worked} on={(v) => set((d) => (d.result.lessons.worked = v))} />
            <Note label="Что не сработало" tone="red" v={r.lessons.failed} on={(v) => set((d) => (d.result.lessons.failed = v))} />
            <Note label="Тональность комментов" v={r.lessons.sentiment} on={(v) => set((d) => (d.result.lessons.sentiment = v))} />
          </div>
          <div className="mt-4">
            <Label>Главный вывод / гипотеза на следующий раз</Label>
            <Area v={r.lessons.learned} onChange={(v) => set((d) => (d.result.lessons.learned = v))} />
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[var(--color-faint)] mr-1">Вердикт:</span>
            {["Повторить", "Изменить подход", "Отказаться"].map((o) => {
              const active = r.lessons.verdict === o;
              return (
                <button
                  key={o}
                  onClick={() => set((d) => (d.result.lessons.verdict = active ? "" : o))}
                  className={[
                    "px-3 py-1 rounded-full text-[13px] border transition-colors",
                    active
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]",
                  ].join(" ")}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </Block>

        <div className="flex items-center justify-end gap-3 pt-1">
          <span className="text-[12px] text-[var(--color-faint)]">
            {saving ? "сохраняю…" : "✓ сохранено"}
          </span>
          <button
            onClick={onSave}
            disabled={saving}
            className="h-9 px-5 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium disabled:opacity-60"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ поля ============ */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-[var(--color-faint)] mb-1">{children}</div>;
}

function Txt({
  v,
  onChange,
  placeholder,
}: {
  v: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={v}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-faint)]"
    />
  );
}

function Area({ v, onChange }: { v: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={v}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] resize-y"
    />
  );
}

function F({
  label,
  v,
  on,
  hint,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)]">
        {label}
        {hint && <span> · план {hint}</span>}
      </div>
      <Txt v={v} onChange={on} />
    </div>
  );
}

// поле-textarea на всю ширину (для брифа)
function FA({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Area v={v} onChange={on} />
    </div>
  );
}

// авто-поле: значение считается, руками не правится
function ReadF({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      <div
        className={[
          "mt-0.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-[13px] tabular-nums border",
          accent
            ? "bg-[var(--color-accent-soft)] border-[var(--color-accent-soft)] text-[var(--color-accent-hover)] font-semibold"
            : "bg-[var(--color-surface-2)] border-[var(--color-line-soft)] text-[var(--color-ink)]",
        ].join(" ")}
      >
        {v || <span className="text-[var(--color-faint)] font-normal">—</span>}
      </div>
    </div>
  );
}

function PlanFact({ label, plan, fact }: { label: string; plan: string; fact: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-line)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[12px] text-[var(--color-muted)] tabular-nums">
          {plan || "—"}
        </span>
        <span className="text-[var(--color-faint)] text-[11px]">→</span>
        <span className="text-[15px] font-semibold tabular-nums">
          {fact || <span className="text-[var(--color-faint)] font-normal">факт</span>}
        </span>
      </div>
    </div>
  );
}

function Note({
  label,
  v,
  on,
  tone,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  tone?: "green" | "red";
}) {
  const bar =
    tone === "green"
      ? "border-l-[var(--color-green)]"
      : tone === "red"
        ? "border-l-[var(--color-red)]"
        : "border-l-[var(--color-line)]";
  return (
    <div className={`pl-3 border-l-2 ${bar}`}>
      <Label>{label}</Label>
      <Area v={v} onChange={on} />
    </div>
  );
}

/* ============ картинки ============ */

function readImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

function ImgOne({
  label,
  value,
  onChange,
  upload,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  upload: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full max-h-56 object-contain rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)]" />
          <button
            onClick={() => onChange("")}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-[15px] leading-none"
            aria-label="Удалить"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className="w-full aspect-[16/9] rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] text-[13px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          + загрузить
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await upload(f));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Gallery({
  imgs,
  onAdd,
  onRemove,
  upload,
}: {
  imgs: string[];
  onAdd: (url: string) => void;
  onRemove: (i: number) => void;
  upload: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {imgs.map((src, i) => (
        <div key={i} className="relative group aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`коммент ${i + 1}`} className="w-full h-full object-cover rounded-[var(--radius-md)] border border-[var(--color-line)]" />
          <button
            onClick={() => onRemove(i)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-[13px] leading-none opacity-0 group-hover:opacity-100"
            aria-label="Удалить"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => ref.current?.click()}
        className="aspect-square rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] text-[12px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        + скрин
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          for (const f of files) onAdd(await upload(f));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ============ мелочи ============ */

function Status({ published }: { published: boolean }) {
  return published ? (
    <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--color-green-soft)] text-[#2e7d32] whitespace-nowrap">
      вышла
    </span>
  ) : (
    <span className="text-[12px] px-2 py-0.5 rounded-full bg-[var(--color-orange-soft)] text-[#b26a00] whitespace-nowrap">
      в работе
    </span>
  );
}

function Mini({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-2 py-1.5">
      <div className="text-[10px] text-[var(--color-faint)]">{label}</div>
      <div className={`text-[13px] font-medium tabular-nums ${accent ? "text-[var(--color-accent-hover)]" : ""}`}>
        {v || "—"}
      </div>
    </div>
  );
}

function Block({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-[var(--radius-lg)] p-4",
        accent
          ? "bg-[var(--color-accent-soft)]"
          : "bg-[var(--color-surface-2)] border border-[var(--color-line-soft)]",
      ].join(" ")}
    >
      <div className="text-[13px] font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{children}</div>;
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-[var(--color-faint)] tabular-nums">{pct}%</span>
    </div>
  );
}

// ───────── автосчёт показателей из введённых сырых данных ─────────
function n(s: string): number {
  const m = String(s ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
function dec(x: number, d = 1): string {
  if (!isFinite(x) || x === 0) return "";
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return String(r).replace(".", ",");
}
function derive(r: Integration["result"]) {
  const cost = n(r.costs.price) + n(r.costs.marking) + n(r.costs.tax);
  const views = n(r.reach.views);
  const engaged = n(r.reach.likes) + n(r.reach.reposts) + n(r.reach.comments_count);
  const clicks = n(r.conversion.clicks);
  const regs = n(r.conversion.registrations);
  const paying = n(r.conversion.paying);
  const revenue = n(r.conversion.revenue);
  return {
    total: cost ? String(Math.round(cost)) : "",
    er: views ? dec((engaged / views) * 100, 1) : "",
    cpv: views && cost ? dec(cost / views, 2) : "",
    cpm: views && cost ? dec((cost / views) * 1000, 0) : "",
    ctr: views && clicks ? dec((clicks / views) * 100, 2) : "",
    cpl: regs && cost ? dec(cost / regs, 0) : "",
    cac: paying && cost ? dec(cost / paying, 0) : "",
    romi: cost ? dec(((revenue - cost) / cost) * 100, 0) : "",
  };
}
function applyDerived(it: Integration) {
  const d = derive(it.result);
  it.result.costs.total = d.total;
  it.result.reach.er = d.er;
  it.result.unit.cpv = d.cpv;
  it.result.unit.cpm = d.cpm;
  it.result.unit.ctr = d.ctr;
  it.result.unit.cpl = d.cpl;
  it.result.unit.cac = d.cac;
  it.result.unit.romi = d.romi;
}

function fillPercent(it: Integration): number {
  const r = it.result;
  const leaves: string[] = [
    r.post_link,
    ...Object.values(r.costs),
    ...Object.values(r.reach),
    ...Object.values(r.conversion),
    ...Object.values(r.unit),
    r.screens.creative,
    r.screens.stats,
    r.screens.comments.length ? "1" : "",
    ...Object.values(r.lessons),
  ];
  const filled = leaves.filter((x) => String(x).trim()).length;
  return Math.round((filled / leaves.length) * 100);
}

function fmtDate(s: string): string {
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${y}`;
  }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return "";
}
