"use client";

import { useMemo } from "react";
import type { Sprint, Placement } from "@/lib/data";

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

function num(s: string): number {
  const m = String(s).replace(/\s| /g, "").match(/-?\d+[.,]?\d*/);
  return m ? parseFloat(m[0].replace(",", ".")) : 0;
}

// текущий этап = первый невыполненный шаг; если все готовы → STEPS.length (Готово)
function currentStage(p: Placement): number {
  for (let i = 0; i < STEPS.length; i++) {
    if (!p.steps[STEPS[i]]) return i;
  }
  return STEPS.length;
}

function doneCount(p: Placement): number {
  return STEPS.filter((s) => p.steps[s]).length;
}

export default function SprintView({ sprint }: { sprint: Sprint }) {
  const cards = sprint.placements;

  const econ = useMemo(() => {
    const spent = cards.reduce(
      (a, p) => a + num(p.price_discount || p.price),
      0
    );
    const reach = cards.reduce((a, p) => a + num(p.forecast_reach), 0);
    const cpvs = cards.map((p) => num(p.forecast_cpv)).filter((x) => x > 0);
    const avgCpv = cpvs.length ? cpvs.reduce((a, b) => a + b, 0) / cpvs.length : 0;
    return { spent, reach, avgCpv, count: cards.length };
  }, [cards]);

  const columns = useMemo(() => {
    const cols: { label: string; idx: number; cards: Placement[] }[] = STEPS.map(
      (label, idx) => ({ label, idx, cards: [] })
    );
    const done: Placement[] = [];
    cards.forEach((p) => {
      const st = currentStage(p);
      if (st >= STEPS.length) done.push(p);
      else cols[st].cards.push(p);
    });
    return { cols, done };
  }, [cards]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">
            Спринт · {sprint.title}
          </h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            {sprint.date_from} — {sprint.date_to} · {econ.count} размещений
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        <Stat label="Размещений" value={String(econ.count)} />
        <Stat label="Бюджет недели" value={fmt(econ.spent) + " ₽"} />
        <Stat label="Прогноз охвата" value={fmt(econ.reach)} />
        <Stat
          label="Средний CPV"
          value={econ.avgCpv ? econ.avgCpv.toFixed(1) + " ₽" : "—"}
        />
      </div>

      <h2 className="text-[15px] font-semibold mb-2">Пайплайн</h2>
      <div className="overflow-x-auto pb-2 mb-8">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {columns.cols.map((col) => (
            <Column key={col.label} title={col.label} n={col.idx + 1}>
              {col.cards.map((p, i) => (
                <Card key={p.name + i} p={p} />
              ))}
            </Column>
          ))}
          <Column title="Готово" done>
            {columns.done.map((p, i) => (
              <Card key={p.name + i} p={p} />
            ))}
          </Column>
        </div>
      </div>

      <h2 className="text-[15px] font-semibold mb-2">Карточки размещений</h2>
      <div className="grid gap-3">
        {cards.map((p, i) => (
          <Detail key={p.name + i} p={p} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[12px] text-[var(--color-muted)]">{label}</div>
      <div className="text-[20px] font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Column({
  title,
  n,
  done,
  children,
}: {
  title: string;
  n?: number;
  done?: boolean;
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="w-[210px] shrink-0">
      <div
        className={[
          "flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-[var(--radius-md)] text-[12px] font-medium",
          done
            ? "bg-[var(--color-green-soft)] text-[#2e7d32]"
            : "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
        ].join(" ")}
      >
        {n && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-accent-soft)] text-[10px] text-[var(--color-accent-hover)]">
            {n}
          </span>
        )}
        <span className="leading-tight">{title}</span>
        <span className="ml-auto opacity-60">{count}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[40px]">{children}</div>
    </div>
  );
}

function Card({ p }: { p: Placement }) {
  const done = doneCount(p);
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
      <div className="text-[13px] font-medium leading-snug">{p.name}</div>
      <div className="text-[11px] text-[var(--color-muted)] mt-1">{p.post_date}</div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-[var(--color-ink)]">
          {p.price_discount || p.price} ₽
        </span>
        <span className="text-[var(--color-faint)]">{done}/10</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)]"
          style={{ width: `${(done / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Detail({ p }: { p: Placement }) {
  // широкие поля — на всю строку, короткие — в сетку
  const wide: [string, string][] = [
    ["Описание автора", p.author_desc],
    ["Аудитория", p.audience],
    ["Тематика поста", p.post_topic],
  ];
  const fields: [string, string][] = [
    ["Дата", p.post_date],
    ["Оффер", p.offer],
    ["Креос", p.creative],
    ["Ленд", p.landing],
    ["UTM", p.utm],
  ];
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="font-semibold text-[15px]">{p.name}</div>
        <div className="text-right text-[12px] text-[var(--color-muted)] shrink-0">
          <div>
            {p.price_discount || p.price} ₽
            {p.price_discount && p.price !== p.price_discount && (
              <span className="line-through ml-1 text-[var(--color-faint)]">
                {p.price}
              </span>
            )}
          </div>
          <div>
            охват {p.forecast_reach} · CPV {p.forecast_cpv} ₽
          </div>
        </div>
      </div>
      <div className="grid gap-y-2 mb-3">
        {wide.map(([label, val]) => (
          <Field key={label} label={label} val={val} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-2 mb-3">
        {fields.map(([label, val]) => (
          <Field key={label} label={label} val={val} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[var(--color-line-soft)]">
        {STEPS.map((s, i) => {
          const ok = p.steps[s];
          return (
            <span
              key={s}
              className={[
                "text-[11px] px-2 py-1 rounded-[var(--radius-md)] border",
                ok
                  ? "bg-[var(--color-green-soft)] border-[var(--color-green-soft)] text-[#2e7d32]"
                  : "bg-[var(--color-surface-2)] border-[var(--color-line-soft)] text-[var(--color-faint)]",
              ].join(" ")}
            >
              {i + 1}. {s}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, val }: { label: string; val: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      <div className="text-[13px] break-words">
        {isUrl(val) ? (
          <a
            href={val}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-accent)] hover:underline break-all"
          >
            {val}
          </a>
        ) : (
          val || <span className="text-[var(--color-faint)]">—</span>
        )}
      </div>
    </div>
  );
}

function isUrl(s: string) {
  return /^https?:\/\//.test(s);
}
function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}
