// lib/sheets.ts
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const sheets = google.sheets("v4");

/** ====== 型定義 ====== */

// 食事ログ 14列: [Date, Time, MealDate, MealType, Input, kcal, protein, fat, carbs, B6, D, Mg, Fe, Zn]
export type MealLogRow = [
  string, // 日付 (YYYY-MM-DD)
  string, // 時刻 (HH:MM)
  string, // MealDate
  string, // MealType
  string, // 入力内容
  number, // kcal
  number, // protein
  number, // fat
  number, // carbs
  number, // vitaminB6
  number, // vitaminD
  number, // magnesium
  number, // iron
  number  // zinc
];

// 運動 / 瞑想 / ジャーナルは共通で [Date, Time, Text]
export type SimpleLogRow = [string, string, string];

/** ====== 共通認証処理 ====== */
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  });
  return auth.getClient();
}

/* ==================================================
   食事ログ関連
================================================== */

/** 食事ログの追加 */
export async function appendMealLog(row: MealLogRow): Promise<void> {
  const authClient = await getAuthClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!A2",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
    auth: authClient,
  });
}

/** 指定日の食事ログを取得 */
export async function getMealLogsByDate(date: string): Promise<MealLogRow[]> {
  const authClient = await getAuthClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!A2:N", // A〜N列（14列分）
    auth: authClient,
  });

  const rows = (res.data.values || []) as string[][];
  return rows.filter((row) => row[2] === date) as unknown as MealLogRow[];
}

/** 任意の期間の食事ログを取得 */
export async function getMealLogsByRange(start: string, end: string): Promise<MealLogRow[]> {
  const authClient = await getAuthClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!A2:N",
    auth: authClient,
  });

  const rows = (res.data.values || []) as string[][];

  if (start === "ALL" && end === "ALL") {
    return rows as unknown as MealLogRow[];
  }

  return rows.filter((row) => row[2] >= start && row[2] <= end) as unknown as MealLogRow[];
}

/** 食事ログの全データ範囲を取得（最初と最後の日付） */
export async function getMealLogDateRange(): Promise<{ start: string; end: string } | null> {
  const authClient = await getAuthClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!C2:C", // Meal Date 列（C列）
    auth: authClient,
  });

  const rows = (res.data.values || []).map((r) => r[0]).filter(Boolean);
  if (rows.length === 0) return null;

  const sorted = rows.sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

/* ==================================================
   運動・瞑想・ジャーナルログ
================================================== */

/** 運動ログの追加 */
export async function appendExerciseLog(row: SimpleLogRow): Promise<void> {
  const authClient = await getAuthClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Exercise Log!A2",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
    auth: authClient,
  });
}

/** 瞑想ログの追加 */
export async function appendMeditationLog(row: SimpleLogRow): Promise<void> {
  const authClient = await getAuthClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meditation Log!A2",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
    auth: authClient,
  });
}

/** ジャーナルログの追加 */
export async function appendJournalLog(row: SimpleLogRow): Promise<void> {
  const authClient = await getAuthClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Journal Log!A2",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
    auth: authClient,
  });
}
