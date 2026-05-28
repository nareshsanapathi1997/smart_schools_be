const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

const getTransporter = () => {
  if (!config.email.user) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();
  if (!transport) {
    console.log('[Email skipped - SMTP not configured]', { to, subject });
    return { skipped: true };
  }
  return transport.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });
};

module.exports = { sendEmail };
