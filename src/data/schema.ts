// Generated from replica/schema.sql. Edit the SQL file, then regenerate.
export const SCHEMA_VERSION = 2;

/** Version 2: first-run flag, vector signatures (replaces the unused image-based table). */
export const MIGRATION_2 = `
alter table settings add column onboarded integer not null default 0 check (onboarded in (0,1));
drop table signatures;
create table signature_strokes (
  id         text primary key,
  strokes    text not null,
  created_at text not null
);
`;

export const SCHEMA_SQL = `
-- On-device SQLite schema (expo-sqlite). No server, no accounts.
-- Times are ISO 8601 UTC strings. Image files live on disk; the DB stores paths.

pragma foreign_keys = on;

create table folders (
  id          text primary key,                       -- uuid generated in app
  name        text not null check (length(name) between 1 and 120),
  parent_id   text references folders(id) on delete cascade,
  locked      integer not null default 0 check (locked in (0,1)),
  created_at  text not null,
  updated_at  text not null
);
create index folders_parent on folders (parent_id);

create table documents (
  id          text primary key,
  title       text not null check (length(title) between 1 and 200),
  folder_id   text references folders(id) on delete set null,
  locked      integer not null default 0 check (locked in (0,1)),
  ocr_text    text,                                   -- concatenated page text, for search
  created_at  text not null,
  updated_at  text not null
);
create index documents_folder  on documents (folder_id);
create index documents_updated on documents (updated_at desc);

create table pages (
  id              text primary key,
  document_id     text not null references documents(id) on delete cascade,
  position        integer not null check (position >= 0),
  original_path   text not null,                      -- untouched capture
  processed_path  text not null,                      -- cropped + filtered result
  crop_corners    text,                               -- json: 4 points, normalised 0..1
  filter          text not null default 'enhanced'
                  check (filter in ('original','enhanced','bw','gray')),
  rotation        integer not null default 0 check (rotation in (0,90,180,270)),
  brightness      real not null default 0 check (brightness between -1 and 1),
  contrast        real not null default 0 check (contrast between -1 and 1),
  ocr_text        text,
  ocr_language    text,
  created_at      text not null,
  unique (document_id, position)
);
create index pages_document on pages (document_id, position);

create table annotations (
  id         text primary key,
  page_id    text not null references pages(id) on delete cascade,
  kind       text not null check (kind in ('draw','highlight','text','signature')),
  data       text not null,                           -- json, normalised coordinates
  created_at text not null
);
create index annotations_page on annotations (page_id);

create table signatures (
  id         text primary key,
  image_path text not null,
  created_at text not null
);

create table tags (
  id   text primary key,
  name text not null unique check (length(name) between 1 and 40)
);
create table document_tags (
  document_id text not null references documents(id) on delete cascade,
  tag_id      text not null references tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

-- One row only. The PIN itself is never stored here: hash and salt go in the
-- device secure store (Keychain / Keystore).
create table settings (
  id               integer primary key check (id = 1),
  default_filter   text not null default 'enhanced',
  export_quality   text not null default 'medium' check (export_quality in ('low','medium','high')),
  pdf_page_size    text not null default 'A4' check (pdf_page_size in ('A4','Letter','fit')),
  theme            text not null default 'system' check (theme in ('system','light','dark')),
  language         text not null default 'system',
  biometrics_lock  integer not null default 0 check (biometrics_lock in (0,1))
);
insert into settings (id) values (1);
`;
