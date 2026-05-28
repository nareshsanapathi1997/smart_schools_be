const crypto = require('crypto');
const db = require('../config/db');

function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function createRazorpayOrder({ invoiceId, studentId, amount, currency = 'INR' }) {
  if (!razorpayConfigured()) {
    return { mock: true, orderId: `mock_${Date.now()}`, amount: Math.round(amount * 100), currency };
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const amountPaise = Math.round(Number(amount) * 100);

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency, receipt: `inv_${String(invoiceId).slice(0, 8)}` }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${await res.text()}`);
  const order = await res.json();

  await db.query(
    `INSERT INTO fee_payment_orders (invoice_id, student_id, razorpay_order_id, amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,'created')`,
    [invoiceId, studentId, order.id, amount, currency]
  );

  return { orderId: order.id, amount: amountPaise, currency, keyId };
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

async function completePayment({ orderId, paymentId, signature }) {
  if (razorpayConfigured() && !verifyRazorpaySignature(orderId, paymentId, signature)) {
    throw new Error('Invalid payment signature');
  }

  const orderRow = await db.query(
    `SELECT * FROM fee_payment_orders WHERE razorpay_order_id = $1 OR ($1 LIKE 'mock_%' AND id::text = $2)`,
    [orderId, orderId.replace('mock_', '')]
  );
  let order = orderRow.rows[0];

  if (!order && orderId.startsWith('mock_')) {
    const mockMatch = await db.query(
      `SELECT * FROM fee_payment_orders WHERE status = 'created' ORDER BY created_at DESC LIMIT 1`
    );
    order = mockMatch.rows[0];
  }
  if (!order) throw new Error('Payment order not found');

  await db.query(
    `UPDATE fee_payment_orders SET razorpay_payment_id = $1, status = 'paid', paid_at = NOW() WHERE id = $2`,
    [paymentId || 'mock_pay', order.id]
  );

  await db.query(
    `UPDATE fee_invoices SET status = 'paid', paid_amount = amount, paid_at = NOW(),
     payment_mode = 'online', reference_no = $1 WHERE id = $2`,
    [paymentId || orderId, order.invoice_id]
  );

  return order;
}

module.exports = { razorpayConfigured, createRazorpayOrder, verifyRazorpaySignature, completePayment };
