# History Speed Catch 개발 명세서 v2.1 (도블 + 실시간 대전 통합본)

> **프로젝트 목표**
>
> 한국사 교과서 기반 **도블(Dobble) 방식** 카드 게임 웹앱을 개발한다.
> 교실 TV(교사 메인 화면)에 카드가 등장하면, 학생들이 각자 기기로
> 방에 접속해 카드를 획득한다. 교사는 별도 관제 화면에서 전체
> 진행 상황을 실시간으로 확인한다.
> GitHub + Vercel + Supabase(Realtime) 기반으로 배포한다.

------------------------------------------------------------------------

# 0. v2.0 대비 변경 요약

| 항목 | v2.0 | v2.1 |
|---|---|---|
| 게임 방식 | 4지선다(Source1~4 중 1개 정답) | 도블 매칭(두 카드 간 공통 기호 1개 찾기) |
| 데이터 단위 | 문제(Question) | 기호(Symbol) → 카드 자동 생성 |
| 참여 방식 | 학생 개별 학번/이름 입력 후 단독 플레이 | 방 코드 입장 + TV 화면 공유 + 실시간 다인 경쟁 |
| 저장소 | LocalStorage만 | LocalStorage(개인 기록) + **Supabase(실시간 방 상태)** |
| 콘텐츠 제작 | 교사가 문제 CSV 직접 작성 | PDF 업로드 → (채팅에서 Claude에게) 기호 CSV 자동 추출 요청 |
| 카드 디자인 | 미정 | 사용자가 Claude Design에서 제작한 이미지 에셋 사용 |

------------------------------------------------------------------------

# 1. 프로젝트 범위

## 포함
- PDF 자료 기반 기호(Symbol) CSV 준비 (앱 외부, 채팅 프롬프트로 지원)
- 기호 CSV 업로드 → 도블 카드 세트 자동 생성
- 방 생성(교사) / 방 코드 입장(학생)
- TV 디스플레이 화면 (카드 등장, 진행 상황)
- 학생 참여 화면 (카드 보기, 정답 기호 클릭)
- 교사 관제 화면 (실시간 순위, 진행률, 다음 카드 제어)
- 실시간 매칭 판정 (Supabase Realtime, 서버 타임스탬프 기준 최초 클릭자 판정)
- 결과 저장(LocalStorage 개인 기록 + Supabase 세션 기록) 및 CSV 다운로드
- GitHub + Vercel 배포

## 제외(MVP 이후)
- 회원가입/비밀번호 로그인 (방 코드 입장만 사용)
- PDF 자동 분석의 **앱 내** 자동화 (채팅 프롬프트로 대체, v1.2에서 재검토)
- 학습 분석 대시보드
- 다중 학급/다중 교사 계정 관리

------------------------------------------------------------------------

# 2. 기술 스택

- Next.js(App Router)
- React
- TypeScript(strict)
- Tailwind CSS
- PapaParse (CSV 파싱)
- **Supabase** (Postgres DB + Realtime Channel — 방/카드/획득 기록 동기화)
- LocalStorage (개인 기기 내 임시 기록)
- GitHub
- Vercel (환경변수로 Supabase URL/anon key 관리)

------------------------------------------------------------------------

# 3. 기호(Symbol) CSV 규격

기존 "문제 단위" 대신 **"기호 단위"** 로 변경.

```text
SymbolID
Label          (카드에 표시될 짧은 이름, 예: 세종대왕)
Unit
SubUnit
ImageURL       (선택 - Claude Design에서 만든 이미지 에셋 경로)
Description    (정답/오답 시 보여줄 해설)
Hint
MemoryHook
```

- UTF-8 형식
- **한 Unit당 최소 13개 이상**의 Symbol 필요 (카드당 기호 수 4개 기준, 13개 기호 → 13장 카드 자동 생성)
- 기호 수에 따른 카드 세트 규모는 아래 표 참고

| 카드당 기호 수 | 전체 기호 종류 | 전체 카드 수 | 비고 |
|---|---|---|---|
| 3 | 7 | 7 | 소규모 단원용 |
| 4 | 13 | 13 | 기본 권장 |
| 5 | 21 | 21 | 단원 통합용 |
| 8 | 57(실사용 55) | 55 | 전 범위 총정리용 |

> PDF → 기호 CSV 추출은 앱이 아니라 **Claude와의 채팅**에서 아래 프롬프트로 진행한다 (부록 A 참고).

------------------------------------------------------------------------

# 4. 사용자 흐름

```text
[교사]
Home → Teacher(기호 CSV 업로드, 방 생성) → TV 화면(방 코드 표시) → 관제 화면

[학생]
Home → Student(방 코드 + 닉네임 입력) → 대기실 → Game(TV와 동시 진행) → 개인 Result
```

------------------------------------------------------------------------

# 5. 화면 명세

## Home
- 학생으로 참여
- 교사로 시작

## Teacher (준비 단계)
- 기호 CSV 업로드
- CSV 미리보기 / 카드 자동 생성 미리보기
- 방 생성 → 방 코드 발급

## TV Display (교실 화면, 별도 URL)
- 방 코드 (학생 입장용)
- 현재 등장한 카드 2장 (도블 보드)
- 실시간 참여 인원 수
- 실시간 상위 랭킹 간단 표시

## Teacher Control (관제 화면)
- 방 코드 / 세션 상태
- 전체 학생 목록 + 실시간 점수
- 다음 카드 쌍 진행 버튼
- 게임 종료 / 결과 확정

## Student (참여 화면)
- 방 코드 + 닉네임 입력 (입장)
- 대기실 (TV 화면 카드가 뜨길 대기)
- 카드 보기 (TV와 동일한 카드 쌍, 모바일 화면 크기에 맞게 재배치)
- 정답 기호 클릭 (제출)
- 정답/오답 즉시 피드백 (Description 표시)

## Result
- 개인 점수 / 정답률 / 반응 속도
- 전체 랭킹
- 다시 참여 / 결과 CSV 다운로드(교사용)

------------------------------------------------------------------------

# 6. 게임 규칙 (도블 매칭 방식)

1. 카드 세트는 Symbol 목록으로부터 알고리즘이 사전 생성 (유한 사영평면 기반, 어떤 두 카드도 공통 기호 정확히 1개)
2. TV 화면과 학생 화면에 **동일한 카드 2장**이 동시에 표시됨
3. 학생은 두 카드에서 **공통된 기호 1개**를 찾아 클릭
4. 서버(Supabase)가 **가장 먼저 도착한 클릭**을 정답자로 판정 (타임스탬프 비교)
5. 정답 판정된 학생: 점수 +1, 해당 기호의 Description/MemoryHook 표시
6. 오답 클릭자: 개인 화면에만 오답 표시 (다른 학생 방해 없음), 재도전 가능
7. 교사가 "다음 카드" 버튼을 누르면 다음 카드 쌍 등장

------------------------------------------------------------------------

# 7. Supabase 데이터 모델

```text
rooms
 ├─ id (uuid, PK)
 ├─ room_code (text, unique, 4~6자리)
 ├─ status (waiting | playing | finished)
 ├─ current_card_pair_index (int)
 └─ created_at

symbols
 ├─ id (uuid, PK)
 ├─ room_id (FK)
 ├─ label, unit, sub_unit, image_url, description, hint, memory_hook

cards
 ├─ id (uuid, PK)
 ├─ room_id (FK)
 ├─ card_index (int)
 └─ symbol_ids (uuid[])   -- 해당 카드에 포함된 기호들

players
 ├─ id (uuid, PK)
 ├─ room_id (FK)
 ├─ nickname (text)
 ├─ score (int, default 0)
 └─ joined_at

card_claims
 ├─ id (uuid, PK)
 ├─ room_id (FK)
 ├─ card_pair_index (int)
 ├─ player_id (FK)
 ├─ symbol_id (FK, 클릭한 기호)
 ├─ is_correct (bool)
 └─ claimed_at (timestamp)   -- 이 값으로 최초 클릭자 판정
```

- **판정 로직**: `card_claims`에 insert 시도 → 해당 `room_id + card_pair_index`에 대해 `is_correct=true`인 행이 이미 있으면 오답 처리, 없으면 정답 처리 (DB 트랜잭션 또는 unique constraint로 race condition 방지)
- **실시간 반영**: `players`, `card_claims`, `rooms` 테이블에 Supabase Realtime 구독 → TV/학생/교사 화면이 각각 알아서 갱신

------------------------------------------------------------------------

# 8. 컴포넌트 구조

```text
Header
CsvUploader              (기호 CSV 업로드 + 미리보기)
RoomCreatePanel          (교사: 방 생성)
RoomJoinForm             (학생: 방 코드 + 닉네임)
TvBoard                  (TV 화면: 카드 2장 + 방코드 + 순위 요약)
StudentBoard             (학생 화면: 카드 2장, 모바일 배치)
DobbleCard               (카드 1장: 기호들을 랜덤 회전/배치)
SymbolTile               (기호 1개: 이미지 + 클릭 핸들러)
TeacherControlPanel      (관제: 학생 목록, 점수, 다음 카드 버튼)
ResultModal / ResultPage
Footer
```

## 데이터 흐름

```text
기호 CSV
 ↓
CsvUploader → lib/dobbleDeck.ts (카드 세트 생성)
 ↓
Supabase(rooms, symbols, cards)
 ↓                     ↘
TvBoard            StudentBoard  ← Supabase Realtime 구독
 ↓                     ↓
클릭 이벤트 → card_claims insert → Supabase 판정
 ↓
players.score 갱신 (Realtime) → 모든 화면 동시 반영
 ↓
Result / LocalStorage(개인 기록) / CSV 다운로드
```

------------------------------------------------------------------------

# 9. 프로젝트 구조

```text
src/
 ├── app/
 │    ├── teacher/          (방 생성, CSV 업로드)
 │    ├── tv/[roomCode]/    (TV 디스플레이)
 │    ├── play/[roomCode]/  (학생 참여)
 │    ├── control/[roomCode]/ (교사 관제)
 │    └── result/[roomCode]/
 ├── components/
 ├── lib/
 │    ├── csv.ts
 │    ├── dobbleDeck.ts      (핵심: 유한 사영평면 카드 생성 알고리즘)
 │    ├── shuffle.ts
 │    ├── storage.ts
 │    └── supabaseClient.ts
 ├── types/
public/
```

------------------------------------------------------------------------

# 10. Sprint 계획 (v2.1)

## Sprint 0
- 프로젝트 생성, GitHub 연결, Vercel 배포
- Supabase 프로젝트 생성 + 환경변수 연결 테스트

## Sprint 1
- 공통 타입 정의 (Symbol, Card, Room, Player, CardClaim)
- Supabase 테이블 스키마 생성

## Sprint 2
- 기호 CSV 업로드 + 미리보기
- `dobbleDeck.ts` 카드 생성 알고리즘 구현 및 검증 (모든 카드 쌍이 공통 기호 정확히 1개인지 테스트)

## Sprint 3
- 방 생성(교사) / 방 코드 입장(학생) 플로우
- Supabase Realtime 구독 기본 연결 확인

## Sprint 4
- TV 화면: 카드 2장 표시
- 학생 화면: 동일 카드 표시 (반응형)

## Sprint 5
- 클릭 → card_claims insert → 정답/최초 클릭자 판정 로직

## Sprint 6
- 점수 실시간 반영 (교사 관제 화면 포함)
- 정답 시 해설(Description/MemoryHook) 표시, 오답 시 개인 화면 피드백

## Sprint 7
- 결과 화면(개인/전체 랭킹) + LocalStorage 개인 기록 + CSV 다운로드

## Sprint 8
- 카드 디자인 에셋(Claude Design 제작물) 적용
- UI 개선 (모바일/TV 화면 최적화)

## Sprint 9
- 최종 테스트 (다수 기기 동시 접속 테스트 포함) 및 배포

------------------------------------------------------------------------

# 11. 개발 원칙 (기존 유지)

- 기능은 하나씩 구현, Build 성공 후 다음 기능 개발
- 기능 추가와 리팩터링 동시 진행 금지
- TypeScript strict 유지, App Router 사용
- 작은 단위로 Git Commit

------------------------------------------------------------------------

# 12. 배포 원칙

- GitHub Push → Vercel 자동 배포
- Vercel 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- npm run lint / npm run build, 실패 시 커밋 금지

------------------------------------------------------------------------

# 13. 디버깅 가이드 (추가분)

## 도블 카드 생성
- 카드 수 / 기호 수 공식(k²+k+1) 검증 스크립트 필수
- 임의의 두 카드를 뽑아 공통 기호가 정확히 1개인지 랜덤 테스트

## Supabase Realtime
- 구독 채널명 room_id 기준으로 분리했는지 확인
- 동시 클릭 시 race condition → unique constraint 또는 RPC 트랜잭션으로 처리했는지 확인
- Realtime 연결 끊김 시 재구독 로직 확인

------------------------------------------------------------------------

# 14. 완료 기준

- 기호 CSV 업로드 → 카드 세트 자동 생성 정상 동작
- 방 생성/입장 정상 동작
- TV/학생 화면 동시 카드 표시 및 동기화
- 실시간 매칭 판정 정확성 (동시 클릭 상황 포함)
- 결과 저장 및 CSV 다운로드
- GitHub + Vercel + Supabase 배포 성공
- 모바일(학생)/TV(대형화면)/PC(교사) 각각 정상 동작

------------------------------------------------------------------------

# 부록 A. PDF → 기호 CSV 추출용 채팅 프롬프트

> 앱이 아닌, Claude와의 별도 채팅에서 PDF를 첨부하고 아래 프롬프트를 사용한다.

```
첨부한 한국사 교과서/자료 PDF를 분석해서 "도블(Dobble) 카드 게임용 역사 요소 목록"을 만들어줘.

조건:
1. 인물, 사건, 유물, 문화재, 제도 등 학생이 시각적으로 구분 가능한
   "역사 요소" 단위로 추출
2. 각 요소는 아래 CSV 컬럼 형식으로 정리:
   SymbolID, Label, Unit, SubUnit, Description(1~2문장 해설), Hint, MemoryHook
3. 한 단원(Unit)당 최소 13개 이상의 요소를 뽑아줘
   (카드 생성 알고리즘상 13개 단위로 묶여야 함)
4. Label은 카드에 들어갈 짧은 이름(예: "세종대왕", "훈민정음", "거북선")으로,
   서로 겹치지 않게
5. 학생 오개념을 유발할 만큼 헷갈리는 요소들도 의도적으로 포함해줘
   (게임 난이도를 위해)
6. 결과는 CSV 코드블록으로 출력
```

------------------------------------------------------------------------

# 15. 향후 버전

## v2.2
- PDF → 기호 CSV 앱 내 자동화 (Claude API 연동)
- 교사 비밀번호 / 반별 결과 관리

## v2.3
- 학습 분석 대시보드
- 다중 학급 동시 운영
