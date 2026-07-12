import { NextResponse } from "next/server";

/**
 * 교사 비밀번호 확인. 비밀번호는 서버 전용 환경변수(TEACHER_PASSWORD, NEXT_PUBLIC_
 * 접두사 없음)로만 보관해 클라이언트 번들에 노출되지 않는다 — 학생이 개발자
 * 도구로 소스를 봐도 실제 비밀번호를 알 수 없다.
 */
export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "서버에 비밀번호가 설정되지 않았습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: password === expected });
}
