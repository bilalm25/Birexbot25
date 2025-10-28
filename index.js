// index.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();
const app = express();
app.use(express.json({ limit: "200kb" }));

// بساطة: حماية بمفتاح API في header x-api-key أو Authorization: Bearer <key>
function checkApiKey(req, res, next) {
  const key = (req.headers["x-api-key"] || (req.headers["authorization"] || "")).toString();
  const expected = process.env.COLLECT_API_KEY;
  if (!expected) return res.status(500).json({ error: "Server missing COLLECT_API_KEY" });
  if (key.startsWith("Bearer ")) {
    if (key.split(" ")[1] === expected) return next();
  } else if (key === expected) return next();
  return res.status(401).json({ error: "Unauthorized - invalid API key" });
}

// init Firestore if service account provided as JSON in ENV
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIRESTORE_PROJECT_ID
  });
  console.log("Firestore initialized");
}
const db = admin.apps.length ? admin.firestore() : null;

/** Helper: call Gemini (Generative Language API)
  * NOTE: API schema may change - we log raw response for debugging.
  */
async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "GPT service not configured.";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateText?key=${key}`;

  // Simple body - adapt if Google changes schema
  const body = {
    prompt: {
      text: prompt
    },
    maxOutputTokens: 300
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  console.log("Gemini response (raw):", JSON.stringify(data).slice(0, 1000));
  // try a few places for text
  if (data?.candidates?.[0]?.output) return data.candidates[0].output;
  if (data?.output?.[0]?.content) return JSON.stringify(data.output[0].content);
  if (data?.text) return data.text;
  return JSON.stringify(data).slice(0, 800);
}

// Main endpoint
app.post("/api/collect-chat-data", checkApiKey, async (req, res) => {
  try {
    const payload = req.body || {};
    payload.receivedAt = new Date().toISOString();

    if (!payload.sessionId || !payload.message) {
      // still save minimal if exists
      if (!payload.sessionId) payload.sessionId = `s_${Date.now()}`;
      if (!payload.message) payload.message = "";
    }

    // query small results from Firestore if client sent parameters (example)
    let propertiesFound = [];
    if (db && payload.parameters?.city) {
      const snap = await db.collection("properties")
        .where("city", "==", payload.parameters.city)
        .limit(5)
        .get();
      snap.forEach(d => propertiesFound.push(d.data()));
    }

    // Prepare prompt to Gemini
    let prompt = `You are a professional real estate assistant. The user said: "${payload.message}".`;
    if (propertiesFound.length) {
      prompt += ` Found ${propertiesFound.length} matching properties. Example: ${propertiesFound.map(p=>`${p.type} in ${p.city} ${p.rooms||""} rooms ${p.price||""}`).join(" | ")}`;
    }
    prompt += " Reply in Arabic, short, friendly, ask next step (contact/visit).";

    // Ask Gemini
    const aiReply = await askGemini(prompt);

    // Save lead/data in Firestore if available
    if (db) {
      const docRef = db.collection("chat_leads").doc(payload.sessionId + "-" + Date.now());
      await docRef.set({ ...payload, aiReply });
    } else {
      // fallback: log to console (or to file if you add fs)
      console.log("Saved locally:", payload);
    }

    // return structured response
    return res.json({
      ok: true,
      aiReply,
      saved: !!db
    });
  } catch (err) {
    console.error("Error in collect endpoint:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
