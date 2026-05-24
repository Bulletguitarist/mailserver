const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,          // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  },
});

// Verify connection on startup
const verifyMailer = async () => {
  try {
    await transporter.verify();
    logger.info('✅ SMTP connection verified');
    return true;
  } catch (err) {
    logger.error('❌ SMTP connection failed: ' + err.message);
    return false;
  }
};

module.exports = { transporter, verifyMailer };