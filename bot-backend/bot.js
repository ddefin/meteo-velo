const fs = require("fs");
const path = require("path");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const MINI_APP_URL = process.env.MINI_APP_URL;
if (!MINI_APP_URL) {
  console.error("Missing MINI_APP_URL environment variable.");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

const ORDERS_FILE = path.join(__dirname, "data", "orders.jsonl");
fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callApi(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error on ${method}:`, data);
  }
  return data;
}

function formatOrder(payload) {
  const lines = payload.items.map(
    (i) => `• ${i.name} x${i.qty} — ${(i.price * i.qty).toFixed(2)} €`
  );
  lines.push("", `Total : ${payload.total.toFixed(2)} €`);
  return lines.join("\n");
}

async function handleWebAppData(message) {
  let payload;
  try {
    payload = JSON.parse(message.web_app_data.data);
  } catch (err) {
    console.error("Invalid web_app_data payload:", message.web_app_data.data);
    return;
  }

  const order = {
    receivedAt: new Date().toISOString(),
    chatId: message.chat.id,
    from: message.from,
    payload,
  };
  fs.appendFileSync(ORDERS_FILE, JSON.stringify(order) + "\n");

  await callApi("sendMessage", {
    chat_id: message.chat.id,
    text: `Merci pour votre commande ! 🎉\n\n${formatOrder(payload)}\n\nNous revenons vers vous rapidement.`,
  });

  if (ADMIN_CHAT_IDS.length > 0) {
    const who = message.from.username ? `@${message.from.username}` : message.from.first_name;
    const text = `🛒 Nouvelle commande de ${who} (chat ${message.chat.id})\n\n${formatOrder(payload)}`;
    for (const adminId of ADMIN_CHAT_IDS) {
      await callApi("sendMessage", { chat_id: adminId, text });
    }
  }
}

async function handleStart(message) {
  await callApi("sendMessage", {
    chat_id: message.chat.id,
    text: "Bienvenue ! Ouvrez la boutique ci-dessous pour parcourir nos parfums et passer commande.",
    reply_markup: {
      keyboard: [[{ text: "🛍️ Ouvrir la boutique", web_app: { url: MINI_APP_URL } }]],
      resize_keyboard: true,
    },
  });
}

async function poll() {
  let offset = 0;
  await callApi("deleteWebhook", { drop_pending_updates: false });
  console.log("Bot démarré, long-polling en cours...");

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();
      if (!data.ok) {
        console.error("getUpdates error:", data);
        await sleep(5000);
        continue;
      }
      for (const update of data.result) {
        console.log("[DEBUG raw update]", JSON.stringify(update));
        offset = update.update_id + 1;
        const message = update.message;
        if (message && message.web_app_data) {
          handleWebAppData(message).catch((err) => console.error("Error handling order:", err));
        } else if (message && message.text === "/start") {
          handleStart(message).catch((err) => console.error("Error handling /start:", err));
        }
      }
    } catch (err) {
      console.error("Polling error:", err);
      await sleep(5000);
    }
  }
}

poll();
