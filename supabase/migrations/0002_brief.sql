-- Бриф размещения внутри интеграции (редактируемые данные карточки).
alter table integrations add column if not exists brief jsonb not null default '{}';

-- Подтягиваем бриф из placements по совпадению спринт+имя (только где пусто).
update integrations i
set brief = jsonb_build_object(
  'author_desc', coalesce(p.author_desc, ''),
  'audience',    coalesce(p.audience, ''),
  'date',        coalesce(p.post_date, ''),
  'post_topic',  coalesce(p.post_topic, ''),
  'offer',       coalesce(p.offer, ''),
  'creative',    coalesce(p.creative, ''),
  'landing',     coalesce(p.landing, ''),
  'utm',         coalesce(p.utm, '')
)
from placements p
where p.sprint_id = i.sprint_id
  and lower(p.name) = lower(i.name)
  and (i.brief = '{}'::jsonb or i.brief is null);
