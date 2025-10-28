import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const COLLECT_API_KEY = process.env.COLLECT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🔥 DEBUG VERSION - هذا الكود راح يظهر كلشي في الـ Logs
async function askGemini(prompt) {
  try {
    console.log("🚀 START Gemini Call");
    console.log("📝 Prompt:", prompt);
    console.log("🔑 API Key exists:", !!GEMINI_API_KEY);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    
    const body = {
      contents: [{ 
        parts: [{ 
          text: `أنت مساعد عقاري محترف. رد بالعربية. السؤال: ${prompt}` 
        }] 
      }]
    };

    console.log("🌐 Sending to Gemini URL:", url);
    
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    console.log("📡 Response Status:", resp.status, resp.statusText);
    
    const responseText = await resp.text();
    console.log("📦 Raw Response:", responseText.substring(0, 500) + "...");
    
    const data = JSON.parse(responseText);
    console.log("🔍 Parsed JSON Keys:", Object.keys(data));
    
    // جرب كل الاحتمالات
    let finalText = "⚠️ No text response";
    
    if (data.candidates && data.candidates[0]) {
      console.log("✅ Found candidates[0]:", JSON.stringify(data.candidates[0]));
      
      if (data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
        finalText = data.candidates[0].content.parts[0].text;
        console.log("🎯 Found text in: candidates[0].content.parts[0].text");
      }
      else if (data.candidates[0].output) {
        finalText = data.candidates[0].output;
        console.log("🎯 Found text in: candidates[0].output");
      }
    }
    else if (data.error) {
      finalText = `❌ Gemini Error: ${data.error.message}`;
      console.log("❌ Gemini API Error:", data.error);
    }
    else if (data.promptFeedback && data.promptFeedback.blockReason) {
      finalText = `🚫 Blocked: ${data.promptFeedback.blockReason}`;
      console.log("🚫 Content blocked:", data.promptFeedback);
    }

    console.log("🎉 FINAL TEXT:", finalText);
    return finalText;
    
  } catch (error) {
    console.error("💥 ERROR in askGemini:", error);
    return "Error calling Gemini API: " + error.message;
  }
}

// المسار الرئيسي
app.post("/api/collect-chat-data", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== COLLECT_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userMessage = req.body?.message || "Hello";
    console.log("📨 Received message:", userMessage);

    const aiReply = await askGemini(userMessage);

    // حفظ في Firebase إذا متوفر
    let saved = false;
    if (process.env.FIREBASE_SERVICE_ACCOUNT && admin.apps.length === 0) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } catch (error) {
        console.error("Firebase init error:", error);
      }
    }

    if (admin.apps.length > 0) {
      const db = admin.firestore();
      await db.collection("chat_logs").add({
        message: userMessage,
        aiReply: aiReply,
        timestamp: new Date().toISOString()
      });
      saved = true;
    }

    res.json({ 
      ok: true, 
      aiReply, 
      saved, 
      sessionId: "test-" + Date.now() 
    });

  } catch (error) {
    console.error("❌ Endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    gemini_key: !!GEMINI_API_KEY,
    api_key: !!COLLECT_API_KEY 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
