import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `select sprint_id, name,
          coalesce(jsonb_array_length(data->'creatives'),0) as n_creatives,
          (data ? 'creatives') as has_key,
          length(data::text) as data_len
     from placements order by sprint_id, name`
);
for (const r of rows) console.log(`${r.sprint_id} | ${r.name} | creatives=${r.n_creatives} | has_key=${r.has_key} | data_len=${r.data_len}`);
await c.end();
