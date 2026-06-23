"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/sprint", "Спринт"],
  ["/backlog", "Бэклог"],
  ["/results", "Результаты"],
  ["/analytics", "Сводка"],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0.5 sm:gap-1 ml-1 sm:ml-2 shrink-0">
      {LINKS.map(([href, label]) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={[
              "px-2.5 sm:px-3 py-1.5 rounded-[var(--radius-md)] text-[14px] sm:text-[15px] whitespace-nowrap transition-colors underline-offset-[8px] decoration-2",
              active
                ? "text-[var(--color-ink)] font-medium underline decoration-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] no-underline",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
