const Imap = require('imap');
const { simpleParser } = require('mailparser');
const logger = require('../utils/logger');

const createImapConnection = () => new Imap({
  user:     process.env.IMAP_USER,
  password: process.env.IMAP_PASS,
  host:     process.env.IMAP_HOST,
  port:     parseInt(process.env.IMAP_PORT),
  tls:      true,
  tlsOptions: { rejectUnauthorized: true },
  authTimeout: 10000,
  connTimeout: 20000,
});

// Fetch last N emails from INBOX
const fetchEmails = (limit = 20) => new Promise((resolve, reject) => {
  const imap = createImapConnection();
  const emails = [];

  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) { imap.end(); return reject(err); }

      const total = box.messages.total;
      if (total === 0) { imap.end(); return resolve([]); }

      // Fetch last `limit` messages
      const start = Math.max(1, total - limit + 1);
      const fetch = imap.seq.fetch(`${start}:${total}`, {
        bodies: '',
        struct: true,
      });

      fetch.on('message', (msg) => {
        const chunks = [];
        msg.on('body', (stream) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', async () => {
            try {
              const parsed = await simpleParser(Buffer.concat(chunks));
              emails.push({
                messageId:  parsed.messageId || null,
                from:       parsed.from?.text || '',
                to:         parsed.to?.text || '',
                subject:    parsed.subject || '(no subject)',
                text:       parsed.text || '',
                html:       parsed.html || null,
                date:       parsed.date || new Date(),
                attachments: parsed.attachments?.map(a => ({
                  filename: a.filename,
                  contentType: a.contentType,
                  size: a.size,
                })) || [],
              });
            } catch (e) {
              logger.error('Parse error: ' + e.message);
            }
          });
        });
      });

      fetch.once('error', (err) => {
        logger.error('Fetch error: ' + err.message);
        reject(err);
      });

      fetch.once('end', () => imap.end());
    });
  });

  imap.once('end', () => resolve(emails));
  imap.once('error', (err) => {
    logger.error('IMAP error: ' + err.message);
    reject(err);
  });

  imap.connect();
});

// Get total unread count
const getUnreadCount = () => new Promise((resolve, reject) => {
  const imap = createImapConnection();

  imap.once('ready', () => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) { imap.end(); return reject(err); }
      const unread = box.messages.unseen || 0;
      imap.end();
      resolve(unread);
    });
  });

  imap.once('end', () => {});
  imap.once('error', reject);
  imap.connect();
});

module.exports = { fetchEmails, getUnreadCount };