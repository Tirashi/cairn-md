-- Cairn — historique des versions (à exécuter une fois dans Supabase › SQL Editor, après schema.sql).
-- Postgres standard ; seul auth.uid() est propre à Supabase. Peut être relancé sans risque.
-- Toute évolution va ici ET dans specs/plan-v1.md.
--
-- Une version = l'état d'une note AVANT une modification. Pour rester léger :
--   * au plus une version toutes les 10 minutes par note (une par séance d'écriture,
--     pas une par sauvegarde automatique), et rien si le texte n'a pas changé ;
--   * tri qui s'éclaircit avec le temps : tout pendant 24 h, puis la dernière de chaque
--     jour jusqu'à 30 jours, de chaque semaine jusqu'à un an, de chaque mois au-delà ;
--   * 50 versions au plus par note ; supprimer une note supprime son historique.

create table if not exists note_versions (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references notes(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id),
  title       text not null,
  content     text not null default '',
  folder      text not null default '',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists note_versions_note_idx on note_versions (note_id, created_at desc);

-- RLS : chacun ne voit, n'ajoute et ne supprime que les versions de ses notes.
alter table note_versions enable row level security;
drop policy if exists "own versions" on note_versions;
create policy "own versions" on note_versions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and exists (select 1 from notes n where n.id = note_id and n.user_id = auth.uid()));

-- Éclaircit l'historique d'une note (appelée après chaque nouvelle version).
create or replace function trier_versions(note uuid) returns void as $$
begin
  delete from note_versions v using (
    select id, row_number() over (partition by tranche order by created_at desc) as rang
    from (
      select id, created_at,
        case
          when created_at > now() - interval '1 day'   then id::text
          when created_at > now() - interval '30 days' then 'j' || date_trunc('day', created_at)::text
          when created_at > now() - interval '1 year'  then 's' || date_trunc('week', created_at)::text
          else 'm' || date_trunc('month', created_at)::text
        end as tranche
      from note_versions where note_id = note
    ) t
  ) r
  where v.id = r.id and r.rang > 1;

  delete from note_versions where id in (
    select id from note_versions where note_id = note order by created_at desc offset 50
  );
end $$ language plpgsql;

-- Garde l'ancien état quand le titre ou le contenu change.
create or replace function garder_version() returns trigger as $$
declare
  derniere note_versions%rowtype;
begin
  select * into derniere from note_versions
    where note_id = old.id order by created_at desc limit 1;
  if found and (derniere.created_at > now() - interval '10 minutes'
                or (derniere.content = old.content and derniere.title = old.title)) then
    return new;
  end if;
  insert into note_versions (note_id, user_id, title, content, folder, tags)
    values (old.id, old.user_id, old.title, old.content, old.folder, old.tags);
  perform trier_versions(old.id);
  return new;
end $$ language plpgsql;

drop trigger if exists notes_versions on notes;
create trigger notes_versions after update on notes
  for each row
  when (old.content is distinct from new.content or old.title is distinct from new.title)
  execute function garder_version();
