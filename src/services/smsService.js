const config = require('../config');

/**
 * SMS via Twilio-compatible REST API or MSG91-style HTTP GET.
 * Set SMS_PROVIDER=twilio|msg91|mock in .env
 */
async function sendSmsMessage(to, message) {
  const provider = process.env.SMS_PROVIDER || 'mock';
  const normalized = String(to).replace(/\D/g, '');

  if (provider === 'mock') {
    console.log(`[SMS mock] To: ${normalized} — ${message.slice(0, 80)}...`);
    return { success: true, mock: true };
  }

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) throw new Error('Twilio SMS not configured');
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `+${normalized}`, From: from, Body: message }),
    });
    if (!res.ok) throw new Error(`Twilio error: ${await res.text()}`);
    return res.json();
  }

  if (provider === 'msg91') {
    const key = process.env.MSG91_AUTH_KEY;
    const sender = process.env.MSG91_SENDER_ID || 'SMARTS';
    if (!key) throw new Error('MSG91 not configured');
    const url = `https://api.msg91.com/api/sendhttp.php?authkey=${key}&mobiles=${normalized}&message=${encodeURIComponent(message)}&sender=${sender}&route=4`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('MSG91 send failed');
    return { success: true };
  }

  throw new Error(`Unknown SMS provider: ${provider}`);
}

module.exports = { sendSmsMessage };
