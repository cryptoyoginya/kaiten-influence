import { getIntegrations, type Integration } from "@/lib/data";

export default function ResultsPage() {
  const items = getIntegrations();
  const live = items.filter((i) => i.published).length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold leading-tight">
          Результаты интеграций
        </h1>
        <p className="text-[14px] text-[var(--color-muted)] mt-1">
          Карточка по каждой вышедшей интеграции: факт-показатели, скрины комментов,
          окупаемость, выводы. {items.length} интеграций · вышло {live}.
        </p>
      </div>

      {/* быстрый переход */}
      <div className="flex flex-wrap gap-2 mb-7">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            className="h-8 px-3 inline-flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-[13px] text-[var(--color-muted)] hover:border-[var(--color-faint)]"
          >
            {i.name}
            <Status published={i.published} small />
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {items.map((i) => (
          <Card key={i.id} it={i} />
        ))}
      </div>
    </div>
  );
}

function Card({ it }: { it: Integration }) {
  const r = it.result;
  return (
    <section
      id={it.id}
      className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden scroll-mt-20"
    >
      {/* шапка */}
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold">{it.name}</h2>
            <Status published={it.published} />
          </div>
          <div className="text-[12px] text-[var(--color-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {it.niche && <span>{it.niche}</span>}
            <span>дата: {fmtDate(it.date) || "—"}</span>
            {it.landing && (
              <a
                href={it.landing}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                лендинг
              </a>
            )}
          </div>
        </div>
        <LinkSlot label="Ссылка на пост" value={r.post_link} />
      </header>

      <div className="p-5 flex flex-col gap-5">
        {/* план → факт */}
        <Block title="План → факт" accent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PlanFact label="Охват" plan={it.plan.reach} fact={r.reach.reach} />
            <PlanFact label="Просмотры" plan={it.plan.views} fact={r.reach.views} />
            <PlanFact label="ERR / ER" plan={it.plan.err} fact={r.reach.er} />
            <PlanFact label="CPV, ₽" plan={it.plan.cpv} fact={r.unit.cpv} />
          </div>
        </Block>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* затраты */}
          <Block title="Затраты">
            <Grid>
              <Cell label="Цена размещения" v={r.costs.price} hint={it.plan.price} />
              <Cell label="Маркировка" v={r.costs.marking} />
              <Cell label="Налог / комиссия" v={r.costs.tax} />
              <Cell label="Итого затрат" v={r.costs.total} strong />
            </Grid>
          </Block>

          {/* вовлечение */}
          <Block title="Охват и вовлечение (факт)">
            <Grid>
              <Cell label="Просмотры" v={r.reach.views} />
              <Cell label="Охват" v={r.reach.reach} />
              <Cell label="Лайки / реакции" v={r.reach.likes} />
              <Cell label="Репосты" v={r.reach.reposts} />
              <Cell label="Комментарии" v={r.reach.comments_count} />
              <Cell label="ER, %" v={r.reach.er} />
            </Grid>
          </Block>

          {/* конверсия */}
          <Block title="Переходы и конверсия">
            <Grid>
              <Cell label="Переходы по ссылке" v={r.conversion.clicks} />
              <Cell label="Регистрации" v={r.conversion.registrations} />
              <Cell label="Активации" v={r.conversion.activations} />
              <Cell label="Платящие" v={r.conversion.paying} />
              <Cell label="Выручка, ₽" v={r.conversion.revenue} />
            </Grid>
          </Block>

          {/* окупаемость */}
          <Block title="Юнит-экономика и окупаемость">
            <Grid>
              <Cell label="CPV факт, ₽" v={r.unit.cpv} />
              <Cell label="CPM, ₽" v={r.unit.cpm} />
              <Cell label="CTR, %" v={r.unit.ctr} />
              <Cell label="CPL (за рег.), ₽" v={r.unit.cpl} />
              <Cell label="CAC (за клиента), ₽" v={r.unit.cac} />
              <Cell label="ROMI, %" v={r.unit.romi} strong />
            </Grid>
            <div className="mt-3">
              <PaybackBadge value={r.unit.payback} />
            </div>
          </Block>
        </div>

        {/* скрины */}
        <Block title="Скриншоты">
          <div className="grid md:grid-cols-4 gap-3">
            <ScreenSlot label="Креатив" value={r.screens.creative} />
            <ScreenSlot label="Статистика поста" value={r.screens.stats} />
            <ScreenSlot label="Скрин комментов" value={r.screens.comments[0]} />
            <ScreenSlot label="Скрин комментов" value={r.screens.comments[1]} />
          </div>
        </Block>

        {/* выводы */}
        <Block title="Чему научились">
          <div className="grid lg:grid-cols-3 gap-4">
            <Note label="Что сработало" v={r.lessons.worked} tone="green" />
            <Note label="Что не сработало" v={r.lessons.failed} tone="red" />
            <Note label="Тональность комментов" v={r.lessons.sentiment} />
          </div>
          <div className="mt-4">
            <div className="text-[12px] text-[var(--color-faint)] mb-1">
              Главный вывод / гипотеза на следующий раз
            </div>
            <Editable v={r.lessons.learned} lines={2} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[12px] text-[var(--color-faint)]">Вердикт:</span>
            <VerdictPill value={r.lessons.verdict} />
          </div>
        </Block>
      </div>
    </section>
  );
}

/* ---------- presentational ---------- */

function Status({ published, small }: { published: boolean; small?: boolean }) {
  const cls = small ? "text-[11px] px-1.5 py-0.5" : "text-[12px] px-2 py-0.5";
  return published ? (
    <span className={`${cls} rounded-full bg-[var(--color-green-soft)] text-[#2e7d32]`}>
      вышла
    </span>
  ) : (
    <span className={`${cls} rounded-full bg-[var(--color-orange-soft)] text-[#b26a00]`}>
      в работе
    </span>
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
          ? "bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30"
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

function Cell({
  label,
  v,
  hint,
  strong,
}: {
  label: string;
  v: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)] flex items-center gap-1.5">
        {label}
        {hint && <span className="text-[var(--color-faint)]">· план {hint}</span>}
      </div>
      <Editable v={v} strong={strong} />
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

// поле, которое будут заполнять — пустое показывается как пунктирный слот
function Editable({ v, strong, lines = 1 }: { v: string; strong?: boolean; lines?: number }) {
  if (v) {
    return (
      <div
        className={[
          "text-[13px] mt-0.5 whitespace-pre-wrap break-words",
          strong ? "font-semibold" : "",
        ].join(" ")}
      >
        {v}
      </div>
    );
  }
  return (
    <div
      className="mt-0.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface)]"
      style={{ minHeight: lines * 18 + 8 }}
    />
  );
}

function Note({ label, v, tone }: { label: string; v: string; tone?: "green" | "red" }) {
  const bar =
    tone === "green"
      ? "border-l-[var(--color-green)]"
      : tone === "red"
        ? "border-l-[var(--color-red)]"
        : "border-l-[var(--color-line)]";
  return (
    <div className={`pl-3 border-l-2 ${bar}`} style={{ borderRadius: 0 }}>
      <div className="text-[12px] text-[var(--color-faint)] mb-1">{label}</div>
      <Editable v={v} lines={2} />
    </div>
  );
}

function ScreenSlot({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-faint)] mb-1">{label}</div>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="block aspect-[4/3] rounded-[var(--radius-md)] border border-[var(--color-line)] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full h-full object-cover" />
        </a>
      ) : (
        <div className="aspect-[4/3] rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] flex items-center justify-center text-[12px] text-[var(--color-faint)]">
          загрузить
        </div>
      )}
    </div>
  );
}

function LinkSlot({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right shrink-0">
      <div className="text-[11px] text-[var(--color-faint)]">{label}</div>
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] text-[var(--color-accent)] hover:underline"
        >
          открыть
        </a>
      ) : (
        <div className="text-[13px] text-[var(--color-faint)]">—</div>
      )}
    </div>
  );
}

function PaybackBadge({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-[12px] text-[var(--color-faint)]">Окупаемость:</span>
      {value ? (
        <span className="font-semibold">{value}</span>
      ) : (
        <span className="px-2 py-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] text-[var(--color-faint)]">
          окупилась? за сколько?
        </span>
      )}
    </div>
  );
}

function VerdictPill({ value }: { value: string }) {
  const options = ["Повторить", "Изменить подход", "Отказаться"];
  if (value) {
    return (
      <span className="px-3 py-1 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] text-[13px] font-medium">
        {value}
      </span>
    );
  }
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <span
          key={o}
          className="px-3 py-1 rounded-full border border-dashed border-[var(--color-line)] text-[12px] text-[var(--color-faint)]"
        >
          {o}
        </span>
      ))}
    </div>
  );
}

function fmtDate(s: string): string {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s.split(" ")[0] || s;
}
