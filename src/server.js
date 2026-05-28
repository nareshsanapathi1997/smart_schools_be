const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const cmsRoutes = require('./routes/cmsRoutes');
const lookupRoutes = require('./routes/lookupRoutes');
const roleRoutes = require('./routes/roleRoutes');
const studentRoutes = require('./routes/studentRoutes');
const erpRoutes = require('./routes/erpRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression({ threshold: 1024 }));
app.use(cors({
  origin(origin, callback) {
    const allowed = new Set([
      config.frontendUrl,
      'http://localhost:3000',
      'http://localhost:4100',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4100',
      ...(process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
    ]);
    if (!origin || allowed.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(xss());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

app.use('/api/', limiter);
app.use('/api/chatbot/chat', strictLimiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/erp/portal/login', strictLimiter);
app.use('/api/erp/teacher/login', strictLimiter);

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  immutable: true,
}));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Smart School API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Smart School API running on port ${PORT} [${config.nodeEnv}]`);
});

module.exports = app;
