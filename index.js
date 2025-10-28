import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware مهم جداً
app.use(cors());
app.use(express.json());

// المسار الحالي - يبقى كما هو
app.get("/", (req, res) => {
  res.send("✅ Webhook is working fine!");
});

// ⚠️ ⚠️ ⚠️ أضف هذا المسار الجديد لـ Dialogflow ⚠️ ⚠️ ⚠️
app.post("/api/collect-chat-data", (req, res) => {
  try {
    console.log("📨 تم استلام بيانات من Dialogflow:", req.body);
    
    // معالجة البيانات من Dialogflow
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

    // هنا يمكنك:
    // - حفظ البيانات في database
    // - إرسال إشعار
    // - معالجة البيانات
    console.log("💬 رسالة المستخدم:", user_message);
    console.log("🎯 الـ Intent:", intent);
    console.log("🕒 الوقت:", timestamp);

    // رد بنجاح لـ Dialogflow
    res.json({
      status: "success",
      message: "تم استلام البيانات بنجاح",
      received_at: new Date().toISOString(),
      data_received: {
        user_message: user_message,
        intent: intent,
        confidence: confidence
      }
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

// مسار إضافي للاختبار
app.get("/api/collect-chat-data", (req, res) => {
  res.json({
    message: "استخدم POST method لإرسال البيانات من Dialogflow",
    example_request: {
      session_id: "session-123",
      user_id: "user-456",
      user_message: "أريد مساعدة",
      bot_response: "كيف يمكنني مساعدتك؟",
      intent: "help_request",
      confidence: 0.95,
      timestamp: "2024-01-15T10:30:00Z"
    }
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
