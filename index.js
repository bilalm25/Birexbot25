import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
const PORT = process.env.PORT || 3000;

// Environment Variables
const COLLECT_API_KEY = process.env.COLLECT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;

// ⚠️ تهيئة Firebase Admin
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: FIRESTORE_PROJECT_ID
  });
  
  console.log("✅ Firebase Admin initialized successfully");
} catch (error) {
  console.error("❌ Error initializing Firebase:", error);
}

const db = admin.firestore();

// Middleware
app.use(cors());
app.use(express.json());

// Middleware للتحقق من API Key
const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (!apiKey || apiKey !== COLLECT_API_KEY) {
    return res.status(401).json({
      status: "error",
      message: "غير مصرح بالوصول - API Key غير صحيح"
    });
  }
  next();
};

// المسار الأساسي
app.get("/", (req, res) => {
  res.send("✅ Webhook is working fine!");
});

// ⚠️ مسار Dialogflow مع حفظ البيانات في Firestore
app.post("/api/collect-chat-data", authenticateAPIKey, async (req, res) => {
  try {
    console.log("📨 تم استلام بيانات من Dialogflow:", req.body);
    
    const {
      session_id,
      user_id,
      user_message,
      bot_response,
      intent,
      confidence,
      parameters,
      timestamp
    } = req.body;

    // 💾 حفظ البيانات في Firestore
    const chatData = {
      session_id: session_id || `session_${Date.now()}`,
      user_id: user_id || 'anonymous',
      user_message: user_message,
      bot_response: bot_response,
      intent: intent,
      confidence: confidence || 0,
      parameters: parameters || {},
      timestamp: timestamp || new Date().toISOString(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // حفظ في collection "chat_logs"
    const docRef = await db.collection('chat_logs').add(chatData);
    
    console.log("💾 تم حفظ البيانات في Firestore مع ID:", docRef.id);

    // رد بنجاح
    res.json({
      status: "success",
      message: "تم استلام وحفظ البيانات بنجاح",
      firestore_id: docRef.id,
      received_at: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ خطأ في معالجة البيانات:", error);
    res.status(500).json({
      status: "error",
      message: "حدث خطأ في الخادم",
      error: error.message
    });
  }
});

// 🔍 مسار لاسترجاع البيانات (للتطوير)
app.get("/api/chat-logs", authenticateAPIKey, async (req, res) => {
  try {
    const snapshot = await db.collection('chat_logs')
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      status: "success",
      count: logs.length,
      logs: logs
    });

  } catch (error) {
    console.error("❌ خطأ في استرجاع البيانات:", error);
    res.status(500).json({
      status: "error",
      message: "حدث خطأ في استرجاع البيانات"
    });
  }
});

// 🤖 مسار لاختبار Gemini AI
app.post("/api/ask-gemini", authenticateAPIKey, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        status: "error",
        message: "Gemini API Key غير مضبوط"
      });
    }

    // TODO: سيتم إضافة كود Gemini AI لاحقاً
    console.log("🤖 رسالة لـ Gemini:", message);

    res.json({
      status: "success",
      message: "سيتم إضافة Gemini AI قريباً",
      your_message: message
    });

  } catch (error) {
    console.error("❌ خطأ في Gemini:", error);
    res.status(500).json({
      status: "error",
      message: "حدث خطأ في خدمة AI"
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 API Key مضبوط: ${!!COLLECT_API_KEY}`);
  console.log(`🤖 Gemini مضبوط: ${!!GEMINI_API_KEY}`);
  console.log(`🔥 Firebase مضبوط: ${!!FIRESTORE_PROJECT_ID}`);
});
