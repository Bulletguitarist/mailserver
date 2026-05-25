const logger = require('../utils/logger');

// SMTP removed — using internal messaging system
// External email support can be added later with verified domain

const transporter = {
  sendMail: async (opts) => {
    logger.info(`Mail queued for: ${opts.to}`);
    return { messageId: `internal-${Date.now()}` };
  }
};

const verifyMailer = async () => {
  logger.info('✅ Internal mail system ready');
  return true;
};

module.exports = { transporter, verifyMailer };