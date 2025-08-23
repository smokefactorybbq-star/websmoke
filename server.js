import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Раздаём статику из /public (картинки) по /images/*
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

// Главная — один HTML из корня
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Healthcheck
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now() })
);

// Приём заказа (секреты остаются на сервере)
app.post("/api/order", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.items || !body.phone || !body.address || !body.total) {
      return res.status(400).json({ ok: false, error: "bad request" });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
    const NGROK_ORDER_URL = process.env.NGROK_ORDER_URL;

    // Формируем текст для Telegram
    const lines = [];
    lines.push("🧾 *Новый заказ с сайта*");
    lines.push(`📍 Адрес: ${body.address}`);
    if (body.name) lines.push(`👤 Имя: ${body.name}`);
    lines.push(`📞 Телефон: ${body.phone}`);
    lines.push("");
    lines.push("*Состав заказа:*");
    Object.entries(body.items).forEach(([n, v]) => {
      lines.push(`• ${n} — ${v.qty} × ${v.price}฿ = ${v.qty * v.price}฿`);
    });
    lines.push("");
    lines.push(`🚚 Доставка: ${body.delivery}฿`);
    lines.push(`💰 Итого: *${body.total}฿*`);
    if (body.orderWhen === "scheduled" && body.orderTime) {
      lines.push(`⏰ Время: ${body.orderTime}`);
    } else {
      lines.push("⏰ Время: ближайшее");
    }
    if (body.comment) {
      lines.push("");
      lines.push(`📝 Комментарий: ${body.comment}`);
    }

    // 1) Telegram
    let tgOk = false;
    if (TELEGRAM_BOT_TOKEN && ADMIN_CHAT_ID) {
      const tgResp = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: lines.join("\n"),
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        }
      );
      tgOk = tgResp.ok;
      if (!tgResp.ok) {
        console.error(
          "Telegram error",
          tgResp.status,
          await tgResp.text().catch(() => "")
        );
      }
    } else {
      console.warn("Telegram env vars missing");
    }

    // 2) Чековая программа (ngrok)
    let printed = false;
    if (NGROK_ORDER_URL) {
      try {
        const pr = await fetch(NGROK_ORDER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        printed = pr.ok;
        if (!pr.ok) {
          console.error("Printer error", pr.status, await pr.text().catch(() => ""));
        }
      } catch (e) {
        console.error("Printer fetch error", e);
      }
    } else {
      console.warn("NGROK_ORDER_URL not set");
    }

    res.json({ ok: true, telegram: tgOk, printed });
  } catch (e) {
    console.error("Order API error:", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Server running: http://localhost:${PORT}`)
);

