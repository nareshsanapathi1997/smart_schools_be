const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const db = require('../config/db');

let openai = null;
if (config.openai.apiKey) {
  openai = new OpenAI({ apiKey: config.openai.apiKey });
}

const SCHOOL_CONTEXT = `You are a helpful AI assistant for Smart International School.
Answer questions about admissions, fees, courses, timings, location, contact, hostel, transport, exams, events, and faculty.
Be warm, professional, and concise. If you don't know something, suggest contacting the school office.
Support English and Telugu. Respond in the user's language.`;

const CACHE_TTL = 5 * 60 * 1000;
let knowledgeCache = { en: null, te: null, expires: 0 };
let settingsCache = null;
let settingsExpires = 0;

async function getKnowledgeBase(language = 'en') {
  const now = Date.now();
  if (knowledgeCache[language] && now < knowledgeCache.expires) {
    return knowledgeCache[language];
  }
  const result = await db.query(
    `SELECT question, answer, category FROM chatbot_faqs
     WHERE is_active = TRUE AND deleted_at IS NULL AND (language = $1 OR language = 'en')
     ORDER BY priority DESC LIMIT 30`,
    [language]
  );
  const text = result.rows.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
  knowledgeCache[language] = text;
  knowledgeCache.expires = now + CACHE_TTL;
  return text;
}

async function getSchoolSettings() {
  if (settingsCache && Date.now() < settingsExpires) return settingsCache;
  const result = await db.query(
    `SELECT key, value FROM settings WHERE key IN ('school_info', 'stats', 'social')`
  );
  settingsCache = {};
  result.rows.forEach((r) => { settingsCache[r.key] = r.value; });
  settingsExpires = Date.now() + CACHE_TTL;
  return settingsCache;
}

function invalidateChatbotCache() {
  knowledgeCache = { en: null, te: null, expires: 0 };
  settingsCache = null;
  settingsExpires = 0;
}

async function generateAIResponse(message, sessionId, language = 'en', channel = 'website') {
  const settings = await getSchoolSettings();
  const knowledge = await getKnowledgeBase(language);
  const schoolInfo = JSON.stringify(settings.school_info || {}, null, 2);

  let botResponse = '';

  if (openai) {
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `${SCHOOL_CONTEXT}\n\nSchool Info:\n${schoolInfo}\n\nKnowledge Base:\n${knowledge}`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    botResponse = completion.choices[0]?.message?.content || getFallback(message, language);
  } else {
    botResponse = await matchFAQ(message, language) || getFallback(message, language);
  }

  await db.query(
    `INSERT INTO chatbot_logs (session_id, channel, user_message, bot_response, language)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId || uuidv4(), channel, message, botResponse, language]
  );

  return botResponse;
}

async function matchFAQ(message, language) {
  const result = await db.query(
    `SELECT answer FROM chatbot_faqs
     WHERE is_active = TRUE AND deleted_at IS NULL
     AND (language = $1 OR language = 'en')
     AND (question ILIKE $2 OR answer ILIKE $2)
     LIMIT 1`,
    [language, `%${message.slice(0, 100)}%`]
  );
  return result.rows[0]?.answer || null;
}

function getFallback(message, language) {
  const en = "Thank you for your question! For detailed assistance, please contact us at +91 98765 43210 or submit an admission enquiry on our website. Our team will respond shortly.";
  const te = "మీ ప్రశ్నకు ధన్యవాదాలు! వివరాల కోసం +91 98765 43210 కు సంప్రదించండి లేదా మా వెబ్‌సైట్‌లో admission enquiry సమర్పించండి.";
  if (/[\u0C00-\u0C7F]/.test(message) || language === 'te') return te;
  return en;
}

function getQuickReplies(language = 'en') {
  if (language === 'te') {
    return ['ప్రవేశ వివరాలు', 'ఫీజు సమాచారం', 'పాఠశాల సమయాలు', 'స్థానం', 'మానవ సహాయం'];
  }
  return ['Admission details', 'Fee information', 'School timings', 'Location', 'Talk to human'];
}

module.exports = {
  generateAIResponse,
  getQuickReplies,
  getKnowledgeBase,
  getFallback,
  invalidateChatbotCache,
};
