const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { generateAIResponse, getQuickReplies, invalidateChatbotCache } = require('../services/chatbotService');

exports.chatValidation = [
  body('message').trim().notEmpty().isLength({ max: 2000 }),
  body('session_id').optional().trim(),
  body('language').optional().isIn(['en', 'te']),
];

exports.chat = asyncHandler(async (req, res) => {
  const { message, session_id, language = 'en' } = req.body;
  const sessionId = session_id || uuidv4();

  if (/talk to human|human handover|మానవ/i.test(message)) {
    await db.query(
      `INSERT INTO chatbot_logs (session_id, channel, user_message, bot_response, language, escalated)
       VALUES ($1, 'website', $2, $3, $4, TRUE)`,
      [sessionId, message, 'Connecting you with our team. Please call +91 98765 43210 or email info@smartschool.edu', language]
    );
    return res.json({
      success: true,
      data: {
        session_id: sessionId,
        response: 'Connecting you with our team. Please call +91 98765 43210 or email info@smartschool.edu',
        escalated: true,
        quick_replies: getQuickReplies(language),
      },
    });
  }

  const response = await generateAIResponse(message, sessionId, language, 'website');
  res.json({
    success: true,
    data: {
      session_id: sessionId,
      response,
      quick_replies: getQuickReplies(language),
    },
  });
});

exports.getFAQs = asyncHandler(async (req, res) => {
  const { language, category } = req.query;
  let query = 'SELECT * FROM chatbot_faqs WHERE deleted_at IS NULL';
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  const params = [];
  let i = 1;
  if (language) { query += ` AND language = $${i++}`; params.push(language); }
  if (category) { query += ` AND category = $${i++}`; params.push(category); }
  query += ' ORDER BY priority DESC, created_at DESC LIMIT 200';
  const result = await db.query(query, params);
  if (req.query.all !== 'true') {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  }
  res.json({ success: true, data: result.rows });
});

exports.createFAQValidation = [
  body('question').trim().notEmpty(),
  body('answer').trim().notEmpty(),
];

exports.createFAQ = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO chatbot_faqs (question, answer, category, keywords, language, priority)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.question, b.answer, b.category || 'general', JSON.stringify(b.keywords || []), b.language || 'en', b.priority || 0]
  );
  invalidateChatbotCache();
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateFAQ = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE chatbot_faqs SET question=$1, answer=$2, category=$3, keywords=$4, language=$5, priority=$6, is_active=$7
     WHERE id=$8 AND deleted_at IS NULL RETURNING *`,
    [b.question, b.answer, b.category, JSON.stringify(b.keywords || []), b.language, b.priority, b.is_active ?? true, req.params.id]
  );
  invalidateChatbotCache();
  res.json({ success: true, data: result.rows[0] });
});

exports.deleteFAQ = asyncHandler(async (req, res) => {
  await db.query('UPDATE chatbot_faqs SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  invalidateChatbotCache();
  res.json({ success: true, message: 'Deleted' });
});

exports.getChatLogs = asyncHandler(async (req, res) => {
  const { channel, search } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const conditions = [];
  const params = [];
  if (channel) {
    params.push(channel);
    conditions.push(`channel = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(user_message ILIKE $${params.length} OR bot_response ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM chatbot_logs ${where}`, params);
  params.push(limit, offset);
  const i = params.length - 1;
  const result = await db.query(
    `SELECT * FROM chatbot_logs ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.getChatAnalytics = asyncHandler(async (_req, res) => {
  const [total, today, escalated, byChannel] = await Promise.all([
    db.query('SELECT COUNT(*) FROM chatbot_logs'),
    db.query("SELECT COUNT(*) FROM chatbot_logs WHERE created_at >= CURRENT_DATE"),
    db.query('SELECT COUNT(*) FROM chatbot_logs WHERE escalated = TRUE'),
    db.query('SELECT channel, COUNT(*) as count FROM chatbot_logs GROUP BY channel'),
  ]);

  res.json({
    success: true,
    data: {
      total: parseInt(total.rows[0].count, 10),
      today: parseInt(today.rows[0].count, 10),
      escalated: parseInt(escalated.rows[0].count, 10),
      by_channel: byChannel.rows,
    },
  });
});
