-- Артефакты по этапам пайплайна (договор, креатив, оплата, маркировка, ссылка на пост…)
alter table placements add column if not exists data jsonb not null default '{}';
