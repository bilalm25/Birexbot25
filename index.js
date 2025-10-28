import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";

const app = express();
app.use(express.json());

// 🧩 التحقق من المفتاح
app.post("/api/collect-chat-data", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.COLLECT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized - invalid API key" });
  }

  const userMessage = req.body?.message || "Hello Gemini!";
  let aiReply = "No response from AI";
  let saved = false;

  try {
    // 🔹 1. تهيئة Firebase فقط مرة واحدة
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    const db = admin.firestore();

    // 🔹 2. استدعاء Gemini API
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
        }),
      }
    );

    const data = await geminiResp.json();
    aiReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || aiReply;

    // 🔹 3. حفظ المحادثة في Firestore
    const sessionId = "s_" + Date.now();
    await db.collection("chat_sessions").doc(sessionId).set({
      sessionId,
      userMessage,
      aiReply,
      createdAt: new Date().toISOString(),
    });
    saved = true;

    // 🔹 4. إرسال الرد
    res.json({ ok: true, aiReply, saved, sessionId });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.listen(8080, () => console.log("🚀 API يعمل على المنفذ 8080"));
