/**
 * lib/dobbleDeck.ts
 *
 * 유한 사영평면(finite projective plane) 기반 도블(Dobble) 카드 세트 생성 알고리즘.
 *
 * 원리: n이 소수(prime)일 때,
 *   - 전체 기호 종류 수 = n^2 + n + 1
 *   - 전체 카드 수       = n^2 + n + 1 (기호 수와 동일)
 *   - 카드당 기호 수     = n + 1
 *   - 어떤 두 카드를 뽑아도 공통 기호가 "정확히 1개"
 *
 * 주의: n이 소수가 아니면(예: n=4) 이 구성법이 성립하지 않는다.
 *       MVP에서는 소수 n만 지원한다 (n=2→7장, n=3→13장(권장), n=7→57장).
 *
 * 검증: 아래 verifyDeck()로 n=2, 3, 7에서 모든 카드 쌍의 공통 기호 수가
 *       정확히 1개임을 전수 확인함 (2026-07-07 검증 완료).
 */

function isPrime(num: number): boolean {
  if (num < 2) return false;
  for (let i = 2; i * i <= num; i++) {
    if (num % i === 0) return false;
  }
  return true;
}

/**
 * 기호 인덱스(0 ~ n^2+n) 기준으로 카드 세트를 생성한다.
 * 반환값: 카드 배열, 각 카드는 기호 인덱스 배열
 */
export function generateDeckIndices(n: number): number[][] {
  if (!isPrime(n)) {
    throw new Error(
      `n=${n}은 소수가 아닙니다. 이 알고리즘은 소수 n에서만 성립합니다. (예: 2, 3, 5, 7...)`
    );
  }

  const cards: number[][] = [];

  // 카드 0: 기호 0 ~ n
  cards.push(Array.from({ length: n + 1 }, (_, i) => i));

  // 다음 n장의 카드
  for (let i = 0; i < n; i++) {
    const card = [0];
    for (let j = 0; j < n; j++) {
      card.push(n + 1 + n * i + j);
    }
    cards.push(card);
  }

  // 나머지 n*n장의 카드
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [i + 1];
      for (let k = 0; k < n; k++) {
        card.push(n + 1 + n * k + ((i * k + j) % n));
      }
      cards.push(card);
    }
  }

  return cards;
}

/**
 * 실제 기호 목록(교사가 업로드한 Symbol 배열)을 받아
 * 도블 카드 세트를 생성한다.
 *
 * symbols.length는 반드시 n^2+n+1 (n은 소수) 꼴이어야 한다.
 * 지원 크기: 7, 13(권장), 57
 */
export function generateDobbleDeck<T>(symbols: T[]): T[][] {
  const total = symbols.length;

  // total = n^2 + n + 1 을 만족하는 소수 n 탐색
  let matchedN: number | null = null;
  for (let n = 2; n <= 20; n++) {
    if (n * n + n + 1 === total && isPrime(n)) {
      matchedN = n;
      break;
    }
  }

  if (matchedN === null) {
    throw new Error(
      `기호 개수(${total})로는 유효한 도블 카드 세트를 만들 수 없습니다. ` +
        `지원되는 기호 개수: 7, 13(권장), 57`
    );
  }

  const deckIndices = generateDeckIndices(matchedN);
  return deckIndices.map((card) => card.map((idx) => symbols[idx]));
}

/**
 * 생성된 카드 세트가 도블 규칙(모든 카드 쌍이 공통 기호 정확히 1개)을
 * 만족하는지 전수 검증한다. 개발/테스트 단계에서만 사용.
 */
export function verifyDeck(n: number): {
  ok: boolean;
  deckLength: number;
  expectedCardCount: number;
  pairCount: number;
  errors: string[];
} {
  const deck = generateDeckIndices(n);
  const expectedCardCount = n * n + n + 1;
  const expectedSymbolsPerCard = n + 1;
  const errors: string[] = [];
  let ok = true;

  if (deck.length !== expectedCardCount) {
    ok = false;
    errors.push(`카드 수 불일치: 기대 ${expectedCardCount}, 실제 ${deck.length}`);
  }

  deck.forEach((card, idx) => {
    if (card.length !== expectedSymbolsPerCard) {
      ok = false;
      errors.push(`카드 ${idx}의 기호 수 불일치`);
    }
    if (new Set(card).size !== card.length) {
      ok = false;
      errors.push(`카드 ${idx} 내부에 중복 기호 존재`);
    }
  });

  let pairCount = 0;
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      pairCount++;
      const setA = new Set(deck[i]);
      const common = deck[j].filter((s) => setA.has(s));
      if (common.length !== 1) {
        ok = false;
        errors.push(`카드 ${i} & 카드 ${j} 공통 기호 ${common.length}개 (기대 1개)`);
      }
    }
  }

  return { ok, deckLength: deck.length, expectedCardCount, pairCount, errors };
}
