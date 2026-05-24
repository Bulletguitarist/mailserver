const Brevo = require('@getbrevo/brevo').default || require('@getbrevo/brevo');
const logger = require('../utils/logger');

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

const sendMail = async ({ from, to, subject, text, html }) => {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
  sendSmtpEmail.sender = { name: 'SecureMail', email: process.env.SMTP_FROM };
  sendSmtpEmail.to = [{ email: Array.isArray(to) ? to[0] : to }];
  return await apiInstance.sendTransacEmail(sendSmtpEmail);
};

const verifyMailer = async () => {
  try {
    if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY not set');
    logger.info('✅ Brevo API ready');
    return true;
  } catch (err) {
    logger.error('❌ Brevo API failed: ' + err.message);
    return false;
  }
};

const transporter = {
  sendMail: async (opts) => {
    const result = await sendMail(opts);
    return { messageId: result?.messageId || `brevo-${Date.now()}` };
  }
};

module.exports = { transporter, verifyMailer };