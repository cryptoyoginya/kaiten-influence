// Применяет SQL-миграции к Supabase по DATABASE_URL.
// Запуск: node --env-file=.env.local supabase/migrate.mjs
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const conn = process.env.DATABASE_URL;

if (!conn || conn.includes("<PASSWORD>")) {
  console.error(
    "✗ Нет DATABASE_URL (или не подставлен пароль) в .env.local.\n" +
      "  Раскомментируй строку DATABASE_URL и впиши пароль БД."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const dir = join(HERE, "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf-8");
    process.stdout.write(`→ ${f} … `);
    await client.query(sql);
    console.log("ok");
  }
  console.log("\nСхема применена.");
}

main()
  .catch((e) => {
    console.error("\n✗ Ошибка миграции:", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
