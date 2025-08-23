// app/api/line/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import OpenAI from "openai";
import {
  appendMealLog,
  appendExerciseLog,
  appendMeditationLog,
  appendJournalLog,
  getMealLogsByRange,
  getMealLogDateRange,
} from "@/lib/sheets";

/** ====== 必須環境変数の存在チェック ====== */
const MUST_ENV = [
  "OPENAI_API_KEY",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "SHEET_ID",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
] as const;
for (const k of MUST_ENV) {
  if (!process.env[k]) {
    console.warn(`[ENV][WARN] ${k} is missing. Set it in .env.local`);
  }
}

/** ====== OpenAI クライアント ====== */
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ====== OpenAI 呼び出し（429/5xxリトライ付き） ====== */
async function callOpenAIWithRetry(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  { maxRetries = 2, temperature = 0.6, max_tokens = 250 }: { maxRetries?: number; temperature?: number; max_tokens?: number } = {}
) {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= maxRetries) {
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature,
        max_tokens,
      });
      return resp;
    } catch (e: any) {
      lastErr = e;
      const status = e?.status || e?.response?.status;
      const isRateOrQuota = status === 429;
      const isRetryable = isRateOrQuota || status >= 500;

      console.error("[OPENAI][ERROR]", status, e?.message || e);

      if (!isRetryable || attempt === maxRetries) break;
      const delayMs = Math.min(500 * Math.pow(2, attempt), 2500);
      await new Promise((r) => setTimeout(r, delayMs));
      attempt++;
    }
  }
  throw lastErr;
}

/** ====== LINE 返信 ====== */
async function replyToLine(replyToken: string, replyText: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: replyText }],
      }),
      signal: controller.signal,
    });
    const body = await res.text().catch(() => "");
    console.log("[LINE][REPLY]", res.status, body?.slice(0, 120));
  } catch (e: any) {
    console.error("[LINE][REPLY][ERR]", e?.message || e);
  } finally {
    clearTimeout(timer);
  }
}

/** ====== ログ種別の判定 ====== */
function detectLogCategory(userText: string): "meal" | "exercise" | "meditation" | "journal" | null {
  const text = userText.toLowerCase();
  if (detectMealType(userText)) return "meal";
  if (text.includes("運動") || text.includes("走") || text.includes("筋トレ") || text.includes("workout") || text.includes("run"))
    return "exercise";
  if (text.includes("瞑想") || text.includes("meditation") || text.includes("座禅"))
    return "meditation";
  if (text.includes("日記") || text.includes("ジャーナル") || text.includes("思った") || text.includes("感じた"))
    return "journal";
  return null;
}

/** ====== MealType 判定 ====== */
function detectMealType(userText: string): string | null {
  const text = userText.toLowerCase();
  if (text.includes("朝") || text.includes("breakfast")) return "朝食";
  if (text.includes("昼") || text.includes("ランチ") || text.includes("lunch")) return "昼食";
  if (text.includes("夜") || text.includes("夕") || text.includes("dinner")) return "夕食";
  if (text.includes("間食") || text.includes("おやつ") || text.includes("snack")) return "間食";
  return null;
}

/** ====== MealDate 判定 ====== */
function detectMealDate(userText: string, now: Date): string {
  const text = userText.toLowerCase();
  if (text.includes("今日") || text.includes("today")) return now.toISOString().split("T")[0];
  if (text.includes("昨日") || text.includes("yesterday")) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return y.toISOString().split("T")[0];
  }
  if (text.includes("一昨日")) {
    const d = new Date(now);
    d.setDate(now.getDate() - 2);
    return d.toISOString().split("T")[0];
  }
  return now.toISOString().split("T")[0];
}

/** ====== 任意の期間指定を検出 ====== */
function detectDateRange(userText: string): { start: string; end: string } | null {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (userText.includes("これまで") || userText.includes("全期間")) return { start: "ALL", end: "ALL" };
  if (userText.includes("先週")) {
    const end = new Date(now); end.setDate(now.getDate() - 1);
    const start = new Date(end); start.setDate(end.getDate() - 6);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  }
  if (userText.includes("今週")) {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - (day - 1));
    return { start: start.toISOString().split("T")[0], end: today };
  }
  if (userText.includes("今月")) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.toISOString().split("T")[0], end: today };
  }
  return null;
}

/** ====== POST: LINE Webhook ====== */
export async function POST(req: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET!;
    const signature = req.headers.get("x-line-signature") || "";
    const bodyText = await req.text();
    const hmac = crypto.createHmac("sha256", channelSecret).update(Buffer.from(bodyText, "utf8")).digest("base64");
    if (!signature || hmac !== signature) {
      console.warn("[LINE] Invalid signature");
      return new NextResponse("Signature validation failed", { status: 401 });
    }

    const json = JSON.parse(bodyText);
    const events = Array.isArray(json.events) ? json.events : [];

    await Promise.all(
      events.map(async (event: any) => {
        try {
          if (event.type !== "message" || event.message?.type !== "text") return;
          
          const userId = event.source?.userId;
          console.log("[LINE][USERID]", userId);
          
          const userText: string = event.message.text?.trim() ?? "";
          if (!userText) return;

          /** ====== ログ種別判定 ====== */
          const category = detectLogCategory(userText);

          /** 📊 食事サマリー要求 */
          const range = detectDateRange(userText);
          if (range && category === "meal") {
            let logs;
            let start = range.start, end = range.end;
            if (start === "ALL" && end === "ALL") {
              logs = await getMealLogsByRange("ALL", "ALL");
              const actualRange = await getMealLogDateRange();
              if (actualRange) { start = actualRange.start; end = actualRange.end; }
            } else {
              logs = await getMealLogsByRange(start, end);
            }
            if (logs.length === 0) {
              await replyToLine(event.replyToken, "その期間の記録はありません📭");
              return;
            }

            const totals = { kcal:0, protein:0, fat:0, carbs:0, vitaminB6:0, vitaminD:0, magnesium:0, iron:0, zinc:0 };
            for (const row of logs) {
              totals.kcal += Number(row[5] || 0);
              totals.protein += Number(row[6] || 0);
              totals.fat += Number(row[7] || 0);
              totals.carbs += Number(row[8] || 0);
              totals.vitaminB6 += Number(row[9] || 0);
              totals.vitaminD += Number(row[10] || 0);
              totals.magnesium += Number(row[11] || 0);
              totals.iron += Number(row[12] || 0);
              totals.zinc += Number(row[13] || 0);
            }
            const days = (new Date(end).getTime() - new Date(start).getTime()) / (1000*60*60*24) + 1;
            const fmt = (label: string, total: number, unit: string) =>
              `${label}: ${total.toFixed(1)} ${unit}（平均 ${(total/days).toFixed(1)} ${unit}/日）`;

            const summaryText =
              `${start} 〜 ${end} のサマリー\n` +
              fmt("カロリー", totals.kcal, "kcal") + "\n" +
              fmt("タンパク質", totals.protein, "g") + "\n" +
              fmt("脂質", totals.fat, "g") + "\n" +
              fmt("炭水化物", totals.carbs, "g") + "\n" +
              fmt("ビタミンB6", totals.vitaminB6, "mg") + "\n" +
              fmt("ビタミンD", totals.vitaminD, "μg") + "\n" +
              fmt("マグネシウム", totals.magnesium, "mg") + "\n" +
              fmt("鉄", totals.iron, "mg") + "\n" +
              fmt("亜鉛", totals.zinc, "mg");

            const feedback = await callOpenAIWithRetry(
              [
                { role: "system", content: "あなたは管理栄養士です。以下の集計結果を参考に、栄養バランスについて短くフィードバックしてください。" },
                { role: "user", content: summaryText },
              ],
              { maxRetries: 1, max_tokens: 300 }
            );
            const feedbackText = feedback.choices?.[0]?.message?.content ?? "";
            await replyToLine(event.replyToken, `${summaryText}\n\n💡 フィードバック:\n${feedbackText}`);
            return;
          }

          /** 🍽️ 食事ログ */
          if (category === "meal") {
            const now = new Date();
            const mealDate = detectMealDate(userText, now);
            const nutritionRes = await callOpenAIWithRetry(
              [
                {
                  role: "system",
                  content:
                    "あなたは管理栄養士です。ユーザーが食べた食事を入力したら、USDAのデータベースを参照し、以下の形式でおおよその栄養素を数値で出力してください。\n\n" +
                    "カロリー: xxx kcal\nタンパク質: xx g\n脂質: xx g\n炭水化物: xx g\nビタミンB6: xx mg\nビタミンD: xx μg\nマグネシウム: xx mg\n鉄: xx mg\n亜鉛: xx mg",
                },
                { role: "user", content: userText },
              ],
              { maxRetries: 1, max_tokens: 250 }
            );
            const nutritionText = nutritionRes.choices?.[0]?.message?.content ?? "";
            const kcal = nutritionText.match(/カロリー[:：]\s*([\d.]+)/)?.[1] || "";
            const protein = nutritionText.match(/タンパク質[:：]\s*([\d.]+)/)?.[1] || "";
            const fat = nutritionText.match(/脂質[:：]\s*([\d.]+)/)?.[1] || "";
            const carbs = nutritionText.match(/炭水化物[:：]\s*([\d.]+)/)?.[1] || "";
            const b6 = nutritionText.match(/ビタミンB6[:：]\s*([\d.]+)/)?.[1] || "";
            const d = nutritionText.match(/ビタミンD[:：]\s*([\d.]+)/)?.[1] || "";
            const mg = nutritionText.match(/マグネシウム[:：]\s*([\d.]+)/)?.[1] || "";
            const iron = nutritionText.match(/鉄[:：]\s*([\d.]+)/)?.[1] || "";
            const zinc = nutritionText.match(/亜鉛[:：]\s*([\d.]+)/)?.[1] || "";

            await appendMealLog([
              now.toISOString().split("T")[0],
              now.toTimeString().slice(0, 5),
              mealDate,
              detectMealType(userText),
              userText,
              kcal || 0,
              protein || 0,
              fat || 0,
              carbs || 0,
              b6 || 0,
              d || 0,
              mg || 0,
              iron || 0,
              zinc || 0,
            ]);

            await replyToLine(event.replyToken, `記録しました📊\n${nutritionText}`);
            return;
          }

          /** 🏃 運動ログ */
          if (category === "exercise") {
            const now = new Date();
            await appendExerciseLog([now.toISOString().split("T")[0], now.toTimeString().slice(0, 5), userText]);
            await replyToLine(event.replyToken, `運動を記録しました💪\n${userText}`);
            return;
          }

          /** 🧘 瞑想ログ */
          if (category === "meditation") {
            const now = new Date();
            await appendMeditationLog([now.toISOString().split("T")[0], now.toTimeString().slice(0, 5), userText]);
            await replyToLine(event.replyToken, `瞑想を記録しました🧘\n${userText}`);
            return;
          }

          /** 📓 ジャーナルログ */
          if (category === "journal") {
            const now = new Date();
            await appendJournalLog([now.toISOString().split("T")[0], now.toTimeString().slice(0, 5), userText]);
            await replyToLine(event.replyToken, `ジャーナルを記録しました✍️\n${userText}`);
            return;
          }

          /** 🗨️ 通常の応答 */
          let replyText = "すみません、もう一度お願いします。";
          try {
            const completion = await callOpenAIWithRetry(
              [
                {
                  role: "system",
                  content: "あなたは優しめの健康コーチです。栄養・運動・瞑想・ジャーナリングをサポートします。",
                },
                { role: "user", content: userText },
              ],
              { maxRetries: 2, max_tokens: 300 }
            );
            replyText = completion.choices?.[0]?.message?.content?.slice(0, 1000) ?? replyText;
          } catch (e: any) {
            replyText = "内部エラーが発生しました。時間をおいて再試行してください。";
          }
          await replyToLine(event.replyToken, replyText);
        } catch (inner: any) {
          console.error("[LINE][EVENT][ERR]", inner?.message || inner);
        }
      })
    );

    return NextResponse.json({ status: "ok" });
  } catch (e: any) {
    console.error("[LINE][ERROR]", e?.message || e);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/** ====== GET: ヘルスチェック ====== */
export async function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
