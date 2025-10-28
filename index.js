// index.js
import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "200kb" }));

// Environment Variables
const COLLECT_API_KEY = process.env.COLLECT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;

// بساطة: حماية بمفتاح API في header x-api-key أو Authorization: Bearer <key>
function checkApiKey(req, res, next) {
  const key = (req.headers["x-api-key"] || (req.headers["authorization"] || "")).toString();
  const expected = COLLECT_API_KEY;
  
  if (!expected) {
    return res.status(500).json({ error: "Server missing COLLECT_API_KEY" });
  }
  
  if (key.startsWith("Bearer ")) {
    if (key.split(" ")[1] === expected) return next();
  } else if (key === expected) return next();
  
  return res.status(401).json({ error: "Unauthorized - invalid API key" });
}

// init Firestore if service account provided as JSON in ENV
let db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: FIRESTORE_PROJECT_ID
    });
    db = admin.firestore();
    console.log("✅ Firebase Admin initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
  }
}

/** Helper: call Gemini (Generative Language API) */
async function askGemini(prompt) {
  const key = GEMINI_API_KEY;
  if (!key) return "Gemini service not configured.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateText?key=${key}`;

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
    console.log("Gemini response received");
    
    // try a few places for text
    if (data?.candidates?.[0]?.output) return data.candidates[0].output;
    if (data?.text) return data.text;
    return "No response from AI";
    
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Error calling AI service";
  }
}

// Main endpoint
app.post("/api/collect-chat-data", checkApiKey, async (req, res) => {
  try {
    const payload = req.body || {};
    payload.receivedAt = new Date().toISOString();

    if (!payload.sessionId) payload.sessionId = `s_${Date.now()}`;
    if (!payload.message) payload.message = "";

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
      prompt += ` Found ${propertiesFound.length} matching properties.`;
    }
    prompt += " Reply in Arabic, short, friendly, ask next step (contact/visit).";

    // Ask Gemini
    const aiReply = await askGemini(prompt);

    // Save lead/data in Firestore if available
    if (db) {
      const docRef = db.collection("chat_leads").doc();
      await docRef.set({ 
        ...payload, 
        aiReply,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ Data saved to Firestore");
    } else {
      console.log("📝 Data logged (Firestore not available):", payload);
    }

    // return structured response
    return res.json({
      ok: true,
      aiReply,
      saved: !!db,
      sessionId: payload.sessionId
    });
    
  } catch (err) {
    console.error("Error in collect endpoint:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "✅ API is working!",
    services: {
      firebase: !!db,
      gemini: !!GEMINI_API_KEY,
      timestamp: new Date().toISOString()
    }
  });
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    time: new Date().toISOString(),
    environment: {
      firebase_configured: !!db,
      gemini_configured: !!GEMINI_API_KEY,
      api_key_configured: !!COLLECT_API_KEY
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🔑 API Key configured: ${!!COLLECT_API_KEY}`);
  console.log(`🤖 Gemini configured: ${!!GEMINI_API_KEY}`);
  console.log(`🔥 Firebase configured: ${!!db}`);
});
