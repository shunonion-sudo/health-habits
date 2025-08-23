// lib/sheets.ts
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const sheets = google.sheets("v4");

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
export async function appendMealLog(row: any[]) {
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
export async function getMealLogsByDate(date: string) {
  const authClient = await getAuthClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!A2:N", // A〜N列（14列分）
    auth: authClient,
  });

  const rows = res.data.values || [];
  return rows.filter((row) => row[2] === date); // Meal Date は列インデックス 2
}

/** 任意の期間の食事ログを取得 */
export async function getMealLogsByRange(start: string, end: string) {
  const authClient = await getAuthClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Meal Log!A2:N",
    auth: authClient,
  });

  const rows = res.data.values || [];

  // 「全期間（これまで）」の場合
  if (start === "ALL" && end === "ALL") {
    return rows;
  }

  return rows.filter((row) => row[2] >= start && row[2] <= end);
}

/** 食事ログの全データ範囲を取得（最初と最後の日付） */
export async function getMealLogDateRange() {
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
export async function appendExerciseLog(row: any[]) {
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
export async function appendMeditationLog(row: any[]) {
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
export async function appendJournalLog(row: any[]) {
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
