import type { Metadata } from "next";
import Link from "next/link";
import { createClient, SUPABASE_ENABLED } from "@/lib/supabase/server";
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

async function currentEmail(): Promise<string | null> {
  if (!SUPABASE_ENABLED) return null;
  try {
    const s = await createClient();
    const {
      data: { user },
    } = await s.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const email = await currentEmail();
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
            <div className="ml-auto flex items-center gap-3">
              {email ? (
                <>
                  <span className="text-[13px] text-[var(--color-muted)]">{email}</span>
                  <form action="/auth/signout" method="post">
                    <button className="text-[13px] text-[var(--color-faint)] hover:text-[var(--color-ink)]">
                      выйти
                    </button>
                  </form>
                </>
              ) : (
                <span className="text-[13px] text-[var(--color-faint)]">
                  Kaiten · продвижение
                </span>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1216px] px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
