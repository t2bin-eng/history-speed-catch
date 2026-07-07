import CsvUploader from "@/components/CsvUploader";

export default function TeacherPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">교사 — 기호 CSV 업로드</h1>
      <CsvUploader />
    </main>
  );
}
