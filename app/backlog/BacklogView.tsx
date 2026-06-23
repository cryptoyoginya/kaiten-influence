"use client";

import { useMemo, useRef, useState } from "react";
import type { Channel } from "@/lib/data";
import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/client";

const WORK_COLS: { key: keyof Channel; label: string }[] = [
  { key: "post_date", label: "Дата" },
  { key: "post_topic", label: "Тематика поста" },
  { key: "offer", label: "Оффер" },
  { key: "creative", label: "Креос" },
  { key: "landing", label: "Ленд" },
  { key: "utm", label: "UTM" },
];

function Cell({ children, w = 180 }: { children: React.ReactNode; w?: number }) {
  const text = typeof children === "string" ? children : undefined;
  return (
    <td
      className="px-3 py-2 align-top text-[13px] text-[var(--color-ink)] border-b border-[var(--color-line-soft)]"
      style={{ maxWidth: w, minWidth: w }}
    >
      <div className="line-clamp-3 whitespace-pre-wrap break-words" title={text}>
        {children || <span className="text-[var(--color-faint)]">—</span>}
      </div>
    </td>
  );
}

function Th({ children, w = 180 }: { children: React.ReactNode; w?: number }) {
  return (
    <th
      className="sticky top-0 z-[1] bg-[var(--color-surface-2)] px-3 py-2 text-left text-[12px] font-medium text-[var(--color-muted)] border-b border-[var(--color-line)]"
      style={{ minWidth: w }}
    >
      {children}
    </th>
  );
}

function chanRow(c: Channel) {
  return {
    name: c.name,
    link: c.link || null,
    niches: c.niches ?? [],
    subscribers: c.subscribers ?? "",
    audience: c.audience ?? "",
    themes: c.themes ?? "",
    err_views: c.err_views ?? "",
    price_raw: c.price_raw ?? "",
    referral: c.referral ?? "",
    comments: c.comments ?? [],
    draft: !!c.draft,
    shortlisted: !!c.shortlisted,
    post_date: c.post_date ?? "",
    post_topic: c.post_topic ?? "",
    offer: c.offer ?? "",
    creative: c.creative ?? "",
    landing: c.landing ?? "",
    utm: c.utm ?? "",
    updated_at: new Date().toISOString(),
  };
}

export default function BacklogView({ channels }: { channels: Channel[] }) {
  const [rows, setRows] = useState<Channel[]>(channels);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => (SUPABASE_ENABLED ? createClient() : null), []);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const niches = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((c) => c.niches.forEach((n) => m.set(n, (m.get(n) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const [q, setQ] = useState("");
  const [niche, setNiche] = useState<string | null>(null);
  const [onlyShort, setOnlyShort] = useState(false);

  const keyOf = (c: Channel) => c.id ?? c.name;

  function scheduleSave(c: Channel) {
    if (!supabase || !c.id) return;
    const k = c.id;
    clearTimeout(timers.current[k]);
    setSaving(true);
    timers.current[k] = setTimeout(async () => {
      await supabase.from("channels").update(chanRow(c)).eq("id", c.id!);
      setSaving(false);
    }, 500);
  }
  function update(id: string, mut: (c: Channel) => void) {
    setRows((prev) => {
      const next = prev.map((c) => {
        if (keyOf(c) !== id) return c;
        const copy: Channel = structuredClone(c);
        mut(copy);
        return copy;
      });
      const changed = next.find((c) => keyOf(c) === id);
      if (changed) scheduleSave(changed);
      return next;
    });
  }
  async function saveNow(c: Channel) {
    if (!supabase || !c.id) return;
    clearTimeout(timers.current[c.id]);
    setSaving(true);
    await supabase.from("channels").update(chanRow(c)).eq("id", c.id);
    setSaving(false);
  }
  async function addChannel() {
    const blank: Channel = {
      name: "Новый блогер",
      link: "",
      niches: [niche ?? "Без ниши"],
      subscribers: "", audience: "", themes: "", err_views: "", price_raw: "",
      referral: "", comments: [], draft: false, shortlisted: false,
      post_date: "", post_topic: "", offer: "", creative: "", landing: "", utm: "",
    };
    if (supabase) {
      const { data } = await supabase.from("channels").insert(chanRow(blank)).select().single();
      if (data) blank.id = data.id;
    } else {
      blank.id = "local-" + Date.now();
    }
    setRows((prev) => [blank, ...prev]);
    setOpenId(blank.id ?? blank.name);
  }
  async function removeChannel(id: string) {
    const c = rows.find((x) => keyOf(x) === id);
    if (supabase && c?.id) await supabase.from("channels").delete().eq("id", c.id);
    setRows((prev) => prev.filter((x) => keyOf(x) !== id));
    setOpenId(null);
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (niche && !c.niches.includes(niche)) return false;
      if (onlyShort && !c.shortlisted) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.audience.toLowerCase().includes(needle) ||
        c.themes.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, niche, onlyShort]);

  const grouped = useMemo(() => {
    const m = new Map<string, Channel[]>();
    filtered.forEach((c) => {
      const key = niche ?? c.niches[0] ?? "Без ниши";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    });
    return [...m.entries()];
  }, [filtered, niche]);

  const open = rows.find((c) => keyOf(c) === openId) ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight mb-3">Бэклог</h1>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            <BStat label="Блогеров" value={rows.length} />
            <BStat label="Ниш" value={niches.length} />
            <BStat label="В шортлисте" value={rows.filter((c) => c.shortlisted).length} accent />
          </div>
        </div>
        <button
          onClick={addChannel}
          className="h-9 px-4 rounded-[var(--radius-lg)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-medium shrink-0"
        >
          + блогер
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени, аудитории, темам…"
          className="h-9 px-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[14px] w-72 outline-none focus:border-[var(--color-accent)]"
        />
        <button onClick={() => setNiche(null)} className={chip(niche === null)}>
          Все ниши
        </button>
        {niches.map(([n, k]) => (
          <button key={n} onClick={() => setNiche(n)} className={chip(niche === n)}>
            {n} <span className="opacity-60">{k}</span>
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-[13px] text-[var(--color-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyShort}
            onChange={(e) => setOnlyShort(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          только шортлист
        </label>
      </div>

      {grouped.map(([n, list]) => (
        <section key={n} className="mb-8">
          <h2 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
            {n}
            <span className="text-[12px] font-normal text-[var(--color-faint)]">{list.length}</span>
          </h2>
          <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            <table className="border-collapse w-full">
              <thead>
                <tr>
                  <Th w={200}>Блогер / канал</Th>
                  <Th w={240}>Описание / темы</Th>
                  <Th w={220}>Аудитория</Th>
                  {WORK_COLS.map((c) => (
                    <Th key={c.key} w={150}>
                      {c.label}
                    </Th>
                  ))}
                  <Th w={120}>Подписчики</Th>
                  <Th w={120}>Просмотры / ERR</Th>
                  <Th w={140}>Цена</Th>
                  <Th w={130}>Рефералка</Th>
                  <Th w={240}>Комментарий</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr
                    key={keyOf(c)}
                    onClick={() => setOpenId(keyOf(c))}
                    className="hover:bg-[var(--color-surface-2)] cursor-pointer"
                  >
                    <Cell w={200}>
                      <div className="flex items-start gap-1.5">
                        {c.shortlisted && (
                          <span
                            title="в шортлисте"
                            className="mt-0.5 inline-block w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0"
                          />
                        )}
                        <span>
                          <span className="font-medium">{c.name}</span>
                          {c.link && (
                            <a
                              href={c.link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block text-[12px] text-[var(--color-accent)] hover:underline truncate"
                            >
                              {c.link.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </span>
                      </div>
                    </Cell>
                    <Cell w={240}>{c.themes}</Cell>
                    <Cell w={220}>{c.audience}</Cell>
                    {WORK_COLS.map((col) => (
                      <Cell key={col.key} w={150}>
                        {c[col.key] as string}
                      </Cell>
                    ))}
                    <Cell w={120}>{c.subscribers}</Cell>
                    <Cell w={120}>{c.err_views}</Cell>
                    <Cell w={140}>{c.price_raw}</Cell>
                    <Cell w={130}>{c.referral}</Cell>
                    <Cell w={240}>{c.comments.join(" · ")}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {open && (
        <ChannelEditor
          c={open}
          id={keyOf(open)}
          update={update}
          remove={removeChannel}
          onSave={() => saveNow(open)}
          saving={saving}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/* ───────── редактор канала ───────── */
function ChannelEditor({
  c,
  id,
  update,
  remove,
  onSave,
  saving,
  onClose,
}: {
  c: Channel;
  id: string;
  update: (id: string, mut: (c: Channel) => void) => void;
  remove: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  const set = (mut: (c: Channel) => void) => update(id, mut);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-6 rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)] rounded-t-[var(--radius-xl)] pr-12 flex items-center justify-between gap-3">
          <input
            value={c.name}
            onChange={(e) => set((x) => (x.name = e.target.value))}
            placeholder="Имя / канал"
            className="flex-1 bg-transparent text-[18px] font-semibold outline-none border-b border-transparent focus:border-[var(--color-accent)]"
          />
          <Check
            label="В шортлисте"
            on={c.shortlisted}
            toggle={() => set((x) => (x.shortlisted = !x.shortlisted))}
          />
        </header>

        <div className="p-6 flex flex-col gap-3">
          <F label="Ссылка" v={c.link} on={(v) => set((x) => (x.link = v))} />
          <F label="Ниши (через запятую)" v={c.niches.join(", ")} on={(v) => set((x) => (x.niches = v.split(",").map((s) => s.trim()).filter(Boolean)))} />
          <FA label="Аудитория" v={c.audience} on={(v) => set((x) => (x.audience = v))} />
          <FA label="Темы / описание" v={c.themes} on={(v) => set((x) => (x.themes = v))} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
            <F label="Подписчики" v={c.subscribers} on={(v) => set((x) => (x.subscribers = v))} />
            <F label="Просмотры / ERR" v={c.err_views} on={(v) => set((x) => (x.err_views = v))} />
            <F label="Цена" v={c.price_raw} on={(v) => set((x) => (x.price_raw = v))} />
            <F label="Рефералка" v={c.referral} on={(v) => set((x) => (x.referral = v))} />
          </div>
          <FA label="Комментарий" v={c.comments.join("\n")} on={(v) => set((x) => (x.comments = v.split("\n").filter((s) => s.trim().length)))} />

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                if (confirm(`Удалить «${c.name}»?`)) remove(id);
              }}
              className="text-[13px] text-[var(--color-red)] hover:underline"
            >
              удалить
            </button>
            <div className="flex items-center gap-3">
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

function F({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)] mb-1">{label}</div>
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
      <div className="text-[11px] text-[var(--color-faint)] mb-1">{label}</div>
      <textarea
        value={v}
        onChange={(e) => on(e.target.value)}
        rows={2}
        className="w-full bg-[var(--color-surface)] text-[13px] px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] outline-none focus:border-[var(--color-accent)] resize-y"
      />
    </div>
  );
}
function Check({ label, on, toggle }: { label: string; on?: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className={[
        "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border text-[13px] transition-colors",
        on
          ? "bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
          : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex items-center justify-center w-4 h-4 rounded-[4px] border text-[11px] leading-none",
          on ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white" : "border-[var(--color-line)]",
        ].join(" ")}
      >
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
function BStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
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
      <div className={["text-[22px] font-semibold mt-0.5 tabular-nums", accent ? "text-[var(--color-accent-hover)]" : ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return [
    "h-8 px-3 rounded-[var(--radius-lg)] text-[13px] border transition-colors",
    active
      ? "bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-accent-hover)]"
      : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-faint)]",
  ].join(" ");
}
