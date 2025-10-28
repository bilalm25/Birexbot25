// index.js
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch"; // تأكد من وجود هذا السطر لاستدعاء API خارجي

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "200kb" }));

const COLLECT_API_KEY = process.env.COLLECT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;

function checkApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || (req.headers["authorization"] || "").toString();
  const expected = COLLECT_API_KEY;

  if (!expected) return res.status(500).json({ error: "Server missing COLLECT_API_KEY" });
  if (key === expected || key === `Bearer ${expected}`) return next();

  return res.status(401).json({ error: "Unauthorized - invalid API key" });
}

// 🔥 Firebase init
let db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: FIRESTORE_PROJECT_ID,
    });
    db = admin.firestore();
    console.log("✅ Firebase initialized");
  } catch (error) {
    console.error("❌ Firebase init error:", error);
  }
}

// 🧠 Gemini connection
async function askGemini(prompt) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    console.log("🔍 Gemini raw:", JSON.stringify(data, null, 2));

    // ✅ استخراج النص الصحيح من الرد
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      data?.text ||
      "⚠️ No text response";

    return text;
  } catch (error) {
    console.error("❌ Error calling Gemini:", error);
    return "Error calling Gemini API";
  }
}

// 🎯 Main endpoint
app.post("/api/collect-chat-data", checkApiKey, async (req, res) => {
  try {
    const payload = req.body || {};
    payload.receivedAt = new Date().toISOString();

    let prompt = `المستخدم قال: "${payload.message}". رد بطريقة ودّية ومهنية باللهجة العربية المناسبة.`;

    const aiReply = await askGemini(prompt);

    if (db) {
      await db.collection("chat_leads").add({
        ...payload,
        aiReply,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("💾 Saved to Firestore");
    }

    res.json({ ok: true, aiReply, saved: !!db, sessionId: payload.sessionId || "none" });
  } catch (err) {
    console.error("❌ Endpoint error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    gemini: !!GEMINI_API_KEY,
    firebase: !!db,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
