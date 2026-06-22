import type { Metadata } from "next";
import Link from "next/link";
import PasscodeGate from "./PasscodeGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaiten · инфлюенс-маркетинг",
  description: "Бэклог блогеров и спринт-доска размещений",
};

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-[var(--radius-md)] text-[15px] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
    >
      {label}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PasscodeGate>
          <header className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-line)]">
            <div className="mx-auto max-w-[1216px] px-6 h-14 flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 font-semibold text-[15px]">
                <span className="inline-block w-6 h-6 rounded-[var(--radius-md)] bg-[var(--color-accent)]" />
                Инфлюенс-маркетинг
              </Link>
              <nav className="flex items-center gap-1 ml-2">
                <NavLink href="/backlog" label="Бэклог" />
                <NavLink href="/sprint" label="Спринт" />
                <NavLink href="/results" label="Результаты" />
                <NavLink href="/analytics" label="Сводка" />
              </nav>
              <div className="ml-auto text-[13px] text-[var(--color-faint)]">
                Kaiten · продвижение
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1216px] px-6 py-8">{children}</main>
        </PasscodeGate>
      </body>
    </html>
  );
}
