const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const { generateAIResponse } = require('../services/chatbotService');
const db = require('../config/db');

exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.handleWebhook = asyncHandler(async (req, res) => {
  res.sendStatus(200);

  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message?.text?.body) return;

  const from = message.from;
  const text = message.text.body;
  const sessionId = `wa-${from}`;

  try {
    const language = /[\u0C00-\u0C7F]/.test(text) ? 'te' : 'en';
    const response = await generateAIResponse(text, sessionId, language, 'whatsapp');

    const url = `https://graph.facebook.com/v18.0/${config.whatsapp.phoneNumberId}/messages`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: response },
      }),
    });
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    await db.query(
      `INSERT INTO chatbot_logs (session_id, channel, user_message, bot_response, metadata)
       VALUES ($1, 'whatsapp', $2, $3, $4)`,
      [sessionId, text, 'Error processing message', JSON.stringify({ error: err.message })]
    );
  }
});
