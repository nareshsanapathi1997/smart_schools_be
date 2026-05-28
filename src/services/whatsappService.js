const config = require('../config');

const sendWhatsAppMessage = async (to, message) => {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.log('[WhatsApp skipped - not configured]', { to, message: message.slice(0, 50) });
    return { skipped: true };
  }

  const url = `https://graph.facebook.com/v18.0/${config.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: message },
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'WhatsApp API error');
  return data;
};

module.exports = { sendWhatsAppMessage };
