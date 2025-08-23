import { NextRequest, NextResponse } from "next/server";

/** ====== LINE Pushメッセージ ====== */
async function pushToLine(userId: string, text: string) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }],
      }),
    });
    console.log("[LINE][PUSH]", res.status);
  } catch (e: any) {
    console.error("[LINE][PUSH][ERR]", e?.message || e);
  }
}

// 固定の userId（自分のIDを .env.local に設定）
const USER_ID = process.env.LINE_USER_ID!;

/** ====== GET: リマインダー送信 ====== */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (!USER_ID) {
    return NextResponse.json({ error: "LINE_USER_ID not set" }, { status: 400 });
  }

  let message = "📌 リマインダー";
  if (type === "morning") {
    message = "🌅 おはようございます！今日の体調をチェックして、朝食・瞑想・ジャーナルを記録しましょう。";
  } else if (type === "night") {
    message = "🌙 1日お疲れさまでした！今日の食事・運動・瞑想・ジャーナルを振り返りましょう。";
  }

  await pushToLine(USER_ID, message);

  return NextResponse.json({ ok: true, type });
}
