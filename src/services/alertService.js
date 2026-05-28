const db = require('../config/db');
const { sendWhatsAppMessage } = require('./whatsappService');
const { sendSmsMessage } = require('./smsService');

function renderTemplate(body, vars) {
  if (!body) return '';
  return String(body).replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

async function getActiveTemplate(eventType, channel = 'whatsapp') {
  const result = await db.query(
    `SELECT * FROM alert_templates WHERE event_type = $1 AND channel = $2 AND is_active = TRUE LIMIT 1`,
    [eventType, channel]
  );
  return result.rows[0] || null;
}

async function dispatchAlert({ recipient, message, channel = 'whatsapp', eventType = 'manual' }) {
  let status = 'sent';
  try {
    if (channel === 'sms') {
      await sendSmsMessage(recipient, message);
    } else {
      await sendWhatsAppMessage(recipient, message);
    }
  } catch (err) {
    status = 'failed';
    console.error('Alert dispatch failed:', err.message);
  }
  await db.query(
    `INSERT INTO alert_logs (recipient, channel, message, status, sent_at) VALUES ($1,$2,$3,$4,NOW())`,
    [recipient, channel, message, status]
  );
  return status;
}

async function fireTemplateAlert(eventType, recipient, vars, channel) {
  const tpl = await getActiveTemplate(eventType, channel || 'whatsapp');
  const message = tpl ? renderTemplate(tpl.template_body, vars) : null;
  if (!message || !recipient) return null;
  return dispatchAlert({ recipient, message, channel: tpl.channel || channel || 'whatsapp', eventType });
}

async function notifyHomeworkPublished(homework) {
  const students = await db.query(
    `SELECT parent_phone, student_name FROM students
     WHERE deleted_at IS NULL AND status = 'active' AND class_level = $1
     AND ($2::text IS NULL OR section = $2 OR $2 = '')`,
    [homework.class_level, homework.section || null]
  );
  for (const s of students.rows) {
    if (!s.parent_phone) continue;
    await fireTemplateAlert('homework_new', s.parent_phone, {
      student_name: s.student_name,
      title: homework.title,
      due_date: homework.due_date ? String(homework.due_date).slice(0, 10) : 'TBD',
      subject: homework.subject || 'General',
    }, 'whatsapp');
  }
}

async function sendFeeDueReminders() {
  const pending = await db.query(
    `SELECT fi.*, s.student_name, s.parent_phone FROM fee_invoices fi
     JOIN students s ON s.id = fi.student_id
     WHERE fi.status = 'pending' AND s.deleted_at IS NULL AND s.parent_phone IS NOT NULL`
  );
  let sent = 0;
  for (const inv of pending.rows) {
    const st = await fireTemplateAlert('fee_due', inv.parent_phone, {
      student_name: inv.student_name,
      title: inv.title,
      amount: String(inv.amount),
      due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : 'soon',
    }, 'whatsapp');
    if (st === 'sent') sent++;
  }
  return { sent, total: pending.rows.length };
}

async function notifyResultsPublished(exam) {
  const marks = await db.query(
    `SELECT em.*, s.parent_phone, s.student_name FROM exam_marks em
     JOIN students s ON s.id = em.student_id
     WHERE em.exam_id = $1 AND s.parent_phone IS NOT NULL`,
    [exam.id]
  );
  for (const m of marks.rows) {
    await fireTemplateAlert('results_published', m.parent_phone, {
      student_name: m.student_name,
      exam_name: exam.name,
      subject: exam.subject,
      marks: String(m.marks_obtained),
      grade: m.grade || '',
    }, 'whatsapp');
  }
}

module.exports = {
  renderTemplate,
  dispatchAlert,
  fireTemplateAlert,
  notifyHomeworkPublished,
  sendFeeDueReminders,
  notifyResultsPublished,
};
