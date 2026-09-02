import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

// Database sementara
const menfess = [];

// ==========================
// AI MODERATION
// ==========================

async function moderate(text) {
  if (!text || text.trim().length < 1) {
    return {
      approved: false,
      reason: "Pesan kosong."
    };
  }

  if (text.length > 1000) {
    return {
      approved: false,
      reason: "Pesan maksimal 1000 karakter."
    };
  }

  // Kalau belum memasukkan API key,
  // pakai filter sederhana.
  if (!openai) {
    const blocked = [
      "penipuan",
      "scam",
      "bunuh diri",
      "bom"
    ];

    const found = blocked.find(word =>
      text.toLowerCase().includes(word)
    );

    return {
      approved: !found,
      reason: found
        ? "Pesan ditolak oleh filter keamanan."
        : ""
    };
  }

  try {
    const result = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",

      input: `
Kamu adalah moderator website menfess anonim.

Periksa pesan berikut.

Tolak jika:
- ancaman kekerasan
- doxxing
- data pribadi sensitif
- penipuan
- spam
- instruksi melakukan kejahatan
- konten berbahaya

Pesan biasa, curhat, kritik, candaan, atau bahasa gaul boleh.

Jawab HANYA JSON:

{
  "approved": true,
  "reason": ""
}

atau

{
  "approved": false,
  "reason": "alasan singkat"
}

Pesan:
${text}
`
    });

    try {
      return JSON.parse(result.output_text);
    } catch {
      return {
        approved: true,
        reason: ""
      };
    }

  } catch (error) {
    console.error(error);

    return {
      approved: false,
      reason: "AI moderation sedang bermasalah."
    };
  }
}

// ==========================
// GET MENFESS
// ==========================

app.get("/api/messages", (req, res) => {
  res.json(
    menfess
      .filter(item => item.status === "published")
      .slice()
      .reverse()
  );
});

// ==========================
// POST MENFESS
// ==========================

app.post("/api/messages", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();

    const moderation = await moderate(text);

    if (!moderation.approved) {
      return res.status(400).json({
        success: false,
        reason: moderation.reason
      });
    }

    const item = {
      id: Date.now(),
      text,
      source: "website",
      status: "published",
      createdAt: new Date().toISOString()
    };

    menfess.push(item);

    res.json({
      success: true,
      message: item
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      reason: "Server error."
    });
  }
});

// ==========================
// WHATSAPP WEBHOOK VERIFY
// ==========================

app.get("/api/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// ==========================
// WHATSAPP WEBHOOK
// ==========================

app.post("/api/whatsapp/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entries = req.body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const messages =
          change.value?.messages || [];

        for (const message of messages) {
          if (message.type !== "text") continue;

          const sender = message.from;
          const text =
            message.text?.body || "";

          // Format:
          // MENFESS: halo semuanya

          if (
            !text
              .toLowerCase()
              .startsWith("menfess:")
          ) {
            await sendWhatsApp(
              sender,
              "Format salah.\n\nGunakan:\nMENFESS: isi pesan kamu"
            );

            continue;
          }

          const content = text
            .substring(8)
            .trim();

          const moderation =
            await moderate(content);

          if (!moderation.approved) {
            await sendWhatsApp(
              sender,
              "❌ Menfess ditolak.\n\n" +
              moderation.reason
            );

            continue;
          }

          menfess.push({
            id: Date.now(),
            text: content,
            source: "whatsapp",
            status: "published",
            createdAt:
              new Date().toISOString()
          });

          await sendWhatsApp(
            sender,
            "✅ Menfess berhasil dikirim secara anonim!"
          );
        }
      }
    }

  } catch (error) {
    console.error(
      "WhatsApp error:",
      error
    );
  }
});

// ==========================
// KIRIM WHATSAPP
// ==========================

async function sendWhatsApp(to, text) {
  if (
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    console.log(
      "WhatsApp belum dikonfigurasi."
    );

    return;
  }

  const url =
    `https://graph.facebook.com/v23.0/` +
    `${process.env.WHATSAPP_PHONE_NUMBER_ID}` +
    `/messages`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization:
        `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify({
      messaging_product: "whatsapp",

      to,

      type: "text",

      text: {
        body: text
      }
    })
  });

  if (!response.ok) {
    console.error(
      await response.text()
    );
  }
}

// ==========================
// FRONTEND
// ==========================

app.use(
  express.static(
    path.join(__dirname, "../frontend")
  )
);

app.get("*splat", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "../frontend/index.html"
    )
  );
});

// ==========================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Menfess AI berjalan di http://localhost:${PORT}`
  );
});
