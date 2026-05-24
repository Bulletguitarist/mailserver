const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

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