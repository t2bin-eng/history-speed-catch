import { supabase } from "./supabaseClient";

const SAVED_SET_ID = "default";

export interface SavedQuestionSet {
  csvText: string;
  fileName: string | null;
  updatedAt: string;
}

/**
 * 마지막으로 저장된 CSV를 불러온다. 저장된 적이 없으면 null.
 */
export async function getSavedQuestionSet(): Promise<SavedQuestionSet | null> {
  const { data, error } = await supabase
    .from("saved_question_sets")
    .select("csv_text, file_name, updated_at")
    .eq("id", SAVED_SET_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    csvText: data.csv_text as string,
    fileName: (data.file_name as string | null) ?? null,
    updatedAt: data.updated_at as string,
  };
}

/**
 * 업로드한 CSV 원문을 저장해 다음 방문 때 재업로드 없이 이어서 쓸 수 있게 한다.
 * (기존 저장분이 있으면 덮어씀 — 파일 하나만 유지)
 */
export async function saveQuestionSet(csvText: string, fileName: string): Promise<void> {
  const { error } = await supabase
    .from("saved_question_sets")
    .upsert({ id: SAVED_SET_ID, csv_text: csvText, file_name: fileName, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
}
