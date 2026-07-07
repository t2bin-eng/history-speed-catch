-- History Speed Catch v2.1 — 초기 스키마 (명세서 §7)
-- Supabase 대시보드 SQL Editor에서 그대로 실행하면 된다.
-- MVP는 방 코드 입장 방식(로그인 없음)이라 RLS는 비활성 상태로 둔다(anon key로 자유 조회/기록).

create extension if not exists pgcrypto;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_card_pair_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists symbols (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  label text not null,
  unit text not null,
  sub_unit text not null default '',
  image_url text,
  description text not null default '',
  hint text not null default '',
  memory_hook text not null default ''
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  card_index integer not null,
  symbol_ids uuid[] not null,
  unique (room_id, card_index)
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now()
);

create table if not exists card_claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  card_pair_index integer not null,
  player_id uuid not null references players(id) on delete cascade,
  symbol_id uuid not null references symbols(id) on delete cascade,
  is_correct boolean not null default false,
  claimed_at timestamptz not null default now()
);

-- 동시 클릭 race condition 방지: room_id + card_pair_index 조합당
-- is_correct = true 인 행을 최대 1개로 제한 (§7 판정 로직의 핵심 제약조건)
create unique index if not exists card_claims_one_correct_per_pair
  on card_claims (room_id, card_pair_index)
  where is_correct = true;

create index if not exists idx_symbols_room_id on symbols(room_id);
create index if not exists idx_cards_room_id on cards(room_id);
create index if not exists idx_players_room_id on players(room_id);
create index if not exists idx_card_claims_room_id on card_claims(room_id);

-- Realtime 구독 대상 (§7: TV/학생/교사 화면이 각각 알아서 갱신)
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table card_claims;

-- Supabase는 새 테이블에 기본적으로 RLS를 켜두므로, 정책 없이 anon key로
-- 쓰기가 전부 막힌다. MVP는 로그인 없는 방 코드 방식이라 명시적으로 끈다.
alter table rooms disable row level security;
alter table symbols disable row level security;
alter table cards disable row level security;
alter table players disable row level security;
alter table card_claims disable row level security;
