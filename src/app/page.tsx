import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 px-6 text-center">
      <h1 className="text-3xl font-bold">역사 카드 게임 — History Speed Catch</h1>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/student"
          className="flex h-12 w-56 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838]"
        >
          학생으로 참여
        </Link>
        <Link
          href="/teacher"
          className="flex h-12 w-56 items-center justify-center rounded-full border border-black/[.15] px-5 transition-colors hover:bg-black/[.04]"
        >
          교사로 시작
        </Link>
      </div>
    </div>
  );
}
