"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleTeacherSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(false);
    try {
      const res = await fetch("/api/verify-teacher-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/teacher");
      } else {
        setError(true);
      }
    } finally {
      setChecking(false);
    }
  }

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
        {!showPasswordForm && (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            className="flex h-12 w-56 items-center justify-center rounded-full border border-black/[.15] px-5 transition-colors hover:bg-black/[.04]"
          >
            교사로 시작
          </button>
        )}
      </div>

      {showPasswordForm && (
        <form onSubmit={handleTeacherSubmit} className="flex w-56 flex-col gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="교사 비밀번호"
            autoFocus
            className="h-11 rounded-full border border-black/[.15] px-4 text-center outline-none focus:border-black/40"
          />
          {error && <p className="text-sm text-red-600">비밀번호가 올바르지 않습니다.</p>}
          <button
            type="submit"
            disabled={checking}
            className="flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50"
          >
            {checking ? "확인 중..." : "확인"}
          </button>
        </form>
      )}
    </div>
  );
}
