-- Cairn — schéma de la base (à exécuter dans Supabase › SQL Editor).
-- Postgres standard ; seul auth.uid() est propre à Supabase.
-- Toute évolution du schéma va ici ET dans specs/plan-v1.md.

create table notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  title       text not null,
  content     text not null default '',
  folder      text not null default '',      -- ex. 'Travail/Projets'
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Titres uniques (insensibles à la casse) pour que [[Titre]] soit non ambigu
create unique index notes_user_title_uq on notes (user_id, lower(title));
create index notes_tags_gin on notes using gin (tags);
create index notes_folder_idx on notes (user_id, folder);

-- updated_at automatique
create function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
create trigger notes_updated before update on notes
  for each row execute function set_updated_at();

-- RLS : chacun ne voit que ses notes
alter table notes enable row level security;
create policy "own notes" on notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
