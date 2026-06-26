import { PIPELINE_STEPS, PIPELINE_LABELS } from "@/lib/data";
import { fetchChannels, fetchSprints } from "@/lib/db";
import {
  parseSubs,
  parseErr,
  parsePrice,
  median,
  fmt,
  fmtShort,
} from "@/lib/parse";

export const dynamic = "force-dynamic";

function num(s: string): number {
  const m = String(s).replace(/\s| /g, "").match(/-?\d+[.,]?\d*/);
  return m ? parseFloat(m[0].replace(",", ".")) : 0;
}

export default async function AnalyticsPage() {
  const channels = await fetchChannels();
  const sprints = await fetchSprints();
  const sprint = sprints.find((s) => s.status === "active") ?? sprints[0];
  const pl = sprint.placements;

  // --- агрегаты по базе ---
  const shortlisted = channels.filter((c) => c.shortlisted).length;
  const published = pl.filter((p) => p.steps["Опубликовано"]).length;
  const addressable = channels.reduce((a, c) => a + (parseSubs(c.subscribers) ?? 0), 0);

  // ниши
  const nicheMap = new Map<
    string,
    { count: number; short: number; errs: number[]; prices: number[]; subs: number }
  >();
  channels.forEach((c) => {
    const err = parseErr(c.err_views);
    const price = parsePrice(c.price_raw);
    const subs = parseSubs(c.subscribers) ?? 0;
    c.niches.forEach((n) => {
      const e = nicheMap.get(n) ?? { count: 0, short: 0, errs: [], prices: [], subs: 0 };
      e.count++;
      if (c.shortlisted) e.short++;
      if (err != null) e.errs.push(err);
      if (price != null) e.prices.push(price);
      e.subs += subs;
      nicheMap.set(n, e);
    });
  });
  const niches = [...nicheMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxNiche = Math.max(...niches.map(([, v]) => v.count));

  // распределение по подписчикам
  const subBuckets = bucketize(
    channels.map((c) => parseSubs(c.subscribers)),
    [
      ["< 10k", (n) => n < 10000],
      ["10–30k", (n) => n >= 10000 && n < 30000],
      ["30–60k", (n) => n >= 30000 && n < 60000],
      ["60k+", (n) => n >= 60000],
    ]
  );
  const errBuckets = bucketize(
    channels.map((c) => parseErr(c.err_views)),
    [
      ["< 5%", (n) => n < 5],
      ["5–10%", (n) => n >= 5 && n < 10],
      ["10–20%", (n) => n >= 10 && n < 20],
      ["20%+", (n) => n >= 20],
    ]
  );

  // экономика спринта
  const budget = pl.reduce((a, p) => a + num(p.price_discount || p.price), 0);
  const reach = pl.reduce((a, p) => a + num(p.forecast_reach), 0);
  const cpvs = pl.map((p) => num(p.forecast_cpv)).filter((x) => x > 0);
  const avgCpv = cpvs.length ? cpvs.reduce((a, b) => a + b, 0) / cpvs.length : 0;

  // прогресс пайплайна
  const stepDone = PIPELINE_STEPS.map(
    (s) => pl.filter((p) => p.steps[s]).length
  );

  // рефералка
  const refReady = pl.filter((p) => p.data?.ref_ready).length;
  const refReg = pl.filter((p) => p.data?.ref_registered).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-tight">Аналитика</h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Блогеров в базе" value={fmt(channels.length)} />
        <Kpi label="В шортлисте" value={fmt(shortlisted)} accent />
        <Kpi label="В спринте" value={fmt(pl.length)} accent />
        <Kpi label="Бюджет недели" value={fmt(budget) + " ₽"} />
        <Kpi label="Прогноз охвата" value={fmtShort(reach)} />
        <Kpi label="Средний CPV" value={avgCpv ? avgCpv.toFixed(1) + " ₽" : "—"} />
        <Kpi label="Готовы к рефералке" value={fmt(refReady)} />
        <Kpi label="Зарегистрированы" value={fmt(refReg)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Воронка */}
        <Panel title="Воронка отбора" hint="как сужается список от ресёрча к публикации">
          <Funnel
            steps={[
              { label: "Лонглист", n: channels.length },
              { label: "Шортлист", n: shortlisted },
              { label: "Спринт", n: pl.length },
              { label: "Опубликовано", n: published },
            ]}
          />
        </Panel>

        {/* Аудитория */}
        <Panel title="Распределение базы" hint="по размеру канала и вовлечённости">
          <div className="grid grid-cols-2 gap-6">
            <BucketBars title="Подписчики" data={subBuckets} />
            <BucketBars title="ERR" data={errBuckets} />
          </div>
        </Panel>
      </div>

      {/* Ниши */}
      <Panel title="Разрез по нишам" hint="объём, шортлист, медианный ERR и цена, суммарный охват">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[12px] text-[var(--color-muted)]">
                <th className="text-left font-medium py-2 pr-3">Ниша</th>
                <th className="text-left font-medium py-2 pr-3 w-[34%]">Каналов</th>
                <th className="text-right font-medium py-2 px-3">Шортлист</th>
                <th className="text-right font-medium py-2 px-3">Медиана ERR</th>
                <th className="text-right font-medium py-2 px-3">Медиана цены</th>
                <th className="text-right font-medium py-2 pl-3">Сумм. подписчики</th>
              </tr>
            </thead>
            <tbody>
              {niches.map(([n, v]) => {
                const me = median(v.errs);
                const mp = median(v.prices);
                return (
                  <tr key={n} className="border-t border-[var(--color-line-soft)]">
                    <td className="py-2 pr-3 text-[13px] font-medium whitespace-nowrap">
                      {n}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-accent)]"
                            style={{ width: `${(v.count / maxNiche) * 100}%` }}
                          />
                        </div>
                        <span className="text-[12px] tabular-nums w-6 text-right">
                          {v.count}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-[13px] tabular-nums">
                      {v.short || "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-[13px] tabular-nums">
                      {me != null ? me.toFixed(1).replace(".", ",") + "%" : "—"}
                    </td>
                    <td className="py-2 px-3 text-right text-[13px] tabular-nums">
                      {mp != null ? fmt(mp) + " ₽" : "—"}
                    </td>
                    <td className="py-2 pl-3 text-right text-[13px] tabular-nums text-[var(--color-muted)]">
                      {fmtShort(v.subs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[var(--color-faint)] mt-3">
          Адресуемая аудитория всей базы: ~{fmtShort(addressable)} подписчиков (с
          пересечениями).
        </p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Пайплайн */}
        <Panel
          title="Прогресс пайплайна спринта"
          hint="сколько из размещений прошли каждый этап"
        >
          <div className="flex flex-col gap-2">
            {PIPELINE_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <span className="text-[12px] text-[var(--color-muted)] w-[150px] shrink-0">
                  {i + 1}. {PIPELINE_LABELS[i]}
                </span>
                <div className="flex-1 h-3 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-green)]"
                    style={{
                      width: `${pl.length ? (stepDone[i] / pl.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-[12px] tabular-nums w-10 text-right">
                  {stepDone[i]}/{pl.length}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Экономика по размещениям */}
        <Panel title="Экономика размещений" hint="бюджет, прогноз охвата и CPV по каждому">
          <div className="flex flex-col gap-3">
            {pl.map((p, i) => {
              const price = num(p.price_discount || p.price);
              const r = num(p.forecast_reach);
              const cpv = num(p.forecast_cpv);
              const maxR = Math.max(...pl.map((x) => num(x.forecast_reach)), 1);
              return (
                <div key={p.name + i}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[var(--color-muted)] tabular-nums">
                      {fmt(price)} ₽ · CPV {cpv ? cpv.toFixed(1) : "—"} ₽
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${(r / maxR) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-[var(--color-muted)] tabular-nums w-14 text-right">
                      {fmtShort(r)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-line-soft)] text-[13px]">
            <span className="text-[var(--color-muted)]">Итого неделя</span>
            <span className="font-semibold tabular-nums">
              {fmt(budget)} ₽ · охват {fmtShort(reach)}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------- presentational ---------- */

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
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

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="text-[12px] text-[var(--color-faint)] mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const top = steps[0].n || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const pct = (s.n / top) * 100;
        const conv = i > 0 && steps[i - 1].n ? (s.n / steps[i - 1].n) * 100 : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--color-muted)] w-24 shrink-0">
              {s.label}
            </span>
            <div className="flex-1 h-8 rounded-[var(--radius-md)] bg-[var(--color-line-soft)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] flex items-center px-2"
                style={{ width: `${Math.max(pct, 6)}%` }}
              >
                <span className="text-[12px] font-medium text-white tabular-nums">
                  {s.n}
                </span>
              </div>
            </div>
            <span className="text-[12px] text-[var(--color-faint)] w-16 text-right tabular-nums">
              {conv != null ? conv.toFixed(0) + "%" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BucketBars({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <div>
      <div className="text-[12px] font-medium text-[var(--color-muted)] mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {data.map(([label, n]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[12px] w-14 shrink-0 text-[var(--color-muted)]">
              {label}
            </span>
            <div className="flex-1 h-2.5 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)]"
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
            <span className="text-[12px] tabular-nums w-6 text-right">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function bucketize(
  values: (number | null)[],
  buckets: [string, (n: number) => boolean][]
): [string, number][] {
  return buckets.map(([label, test]) => [
    label,
    values.filter((v): v is number => v != null && test(v)).length,
  ]);
}
