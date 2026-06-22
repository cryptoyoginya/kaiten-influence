"use client";

import { useMemo, useState } from "react";
import type { Channel } from "@/lib/data";

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

export default function BacklogView({ channels }: { channels: Channel[] }) {
  const niches = useMemo(() => {
    const m = new Map<string, number>();
    channels.forEach((c) => c.niches.forEach((n) => m.set(n, (m.get(n) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [channels]);

  const [q, setQ] = useState("");
  const [niche, setNiche] = useState<string | null>(null);
  const [onlyShort, setOnlyShort] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return channels.filter((c) => {
      if (niche && !c.niches.includes(niche)) return false;
      if (onlyShort && !c.shortlisted) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.audience.toLowerCase().includes(needle) ||
        c.themes.toLowerCase().includes(needle)
      );
    });
  }, [channels, q, niche, onlyShort]);

  const grouped = useMemo(() => {
    const m = new Map<string, Channel[]>();
    filtered.forEach((c) => {
      const key = niche ?? c.niches[0] ?? "Без ниши";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    });
    return [...m.entries()];
  }, [filtered, niche]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Бэклог</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            {channels.length} блогеров · {niches.length} ниш ·{" "}
            {channels.filter((c) => c.shortlisted).length} в шортлисте
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени, аудитории, темам…"
          className="h-9 px-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[14px] w-72 outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => setNiche(null)}
          className={chip(niche === null)}
        >
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

      {grouped.map(([n, rows]) => (
        <section key={n} className="mb-8">
          <h2 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
            {n}
            <span className="text-[12px] font-normal text-[var(--color-faint)]">
              {rows.length}
            </span>
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
                {rows.map((c, i) => (
                  <tr key={c.name + i} className="hover:bg-[var(--color-surface-2)]">
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
