-- History Speed Catch v2.1 — 초기 스키마 (명세서 §7)
-- Supabase 대시보드 SQL Editor에서 그대로 실행하면 된다.
-- MVP는 방 코드 입장 방식(로그인 없음)이라 RLS는 비활성 상태로 둔다(anon key로 자유 조회/기록).

create extension if not exists pgcrypto;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_card_pair_index integer not null default 0,
  round_phase text not null default 'matching'
    check (round_phase in ('matching', 'priority_answering', 'open_answering', 'resolved')),
  priority_player_id uuid,
  priority_started_at timestamptz,
  current_center_card_id uuid,
  priority_symbol_id uuid,
  -- 상위권 독식을 완화하는 보너스 라운드. 'jackpot'(누가 맞히든 5배)은 매 라운드
  -- 12.5% 확률, 'chance'(1등이 아닌 사람이 맞히면 3배+1등 카드 스틸)는 6라운드
  -- 이후 30% 확률로 등장 — revealNextCenterCard에서 결정해 저장한다.
  round_bonus text not null default 'none' check (round_bonus in ('none', 'jackpot', 'chance')),
  last_steal_victim_nickname text,
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
  memory_hook text not null default '',
  icon_name text,
  question_text text not null default '',
  choice_a text not null default '',
  choice_b text not null default '',
  choice_c text not null default '',
  choice_d text not null default '',
  correct_choice text check (correct_choice in ('a', 'b', 'c', 'd')),
  difficulty integer not null default 1 check (difficulty between 1 and 3)
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
  streak integer not null default 0,
  card_id uuid references cards(id),
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

-- 결과 화면의 "반응 속도" 계산용: 각 카드 쌍이 실제로 화면에 뜬 시각을 기록한다
-- (게임 시작/다음 카드 진행 시 기록). claimed_at - started_at으로 반응 시간을 구한다.
create table if not exists round_starts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  card_pair_index integer not null,
  started_at timestamptz not null default now(),
  unique (room_id, card_pair_index)
);

-- 우선권 독점 구간이 풀려서(오답/시간초과) 전원에게 공개된 뒤 "누가 문제를 맞혔는지"
-- 기록한다. card_claims(매칭 판정)와는 별개로 "정답 판정"을 위한 테이블 — 같은
-- race condition 방지 패턴(partial unique index)을 그대로 재사용한다.
create table if not exists answer_claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  card_pair_index integer not null,
  player_id uuid not null references players(id) on delete cascade,
  symbol_id uuid not null references symbols(id) on delete cascade,
  chosen_choice text not null check (chosen_choice in ('a', 'b', 'c', 'd')),
  is_correct boolean not null default false,
  claimed_at timestamptz not null default now()
);

create unique index if not exists answer_claims_one_correct_per_pair
  on answer_claims (room_id, card_pair_index)
  where is_correct = true;

-- 진짜 도블처럼 학생마다 고정된 개인 카드를 갖고, 교사가 "카드 제시"를 누를 때마다
-- 중앙 카드가 하나씩 공개된다. 이 테이블은 그 공개 이력을 기록해 다음 카드를 고를 때
-- "이미 어떤 학생에게 보여준 기호인지" 판단하는 데 쓴다(revealNextCenterCard 참고).
create table if not exists center_reveals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_index integer not null,
  card_id uuid not null references cards(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  unique (room_id, round_index)
);

create index if not exists idx_symbols_room_id on symbols(room_id);
create index if not exists idx_cards_room_id on cards(room_id);
create index if not exists idx_players_room_id on players(room_id);
create index if not exists idx_card_claims_room_id on card_claims(room_id);
create index if not exists idx_round_starts_room_id on round_starts(room_id);
create index if not exists idx_answer_claims_room_id on answer_claims(room_id);
create index if not exists idx_center_reveals_room_id on center_reveals(room_id);

-- Realtime 구독 대상 (§7: TV/학생/교사 화면이 각각 알아서 갱신)
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table card_claims;
alter publication supabase_realtime add table answer_claims;

-- Supabase는 새 테이블에 기본적으로 RLS를 켜두므로, 정책 없이 anon key로
-- 쓰기가 전부 막힌다. MVP는 로그인 없는 방 코드 방식이라 명시적으로 끈다.
alter table rooms disable row level security;
alter table symbols disable row level security;
alter table cards disable row level security;
alter table players disable row level security;
alter table card_claims disable row level security;
alter table round_starts disable row level security;
alter table answer_claims disable row level security;
alter table center_reveals disable row level security;
