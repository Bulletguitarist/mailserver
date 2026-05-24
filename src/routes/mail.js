const router  = require('express').Router();
const db      = require('../config/db');
const { transporter } = require('../config/mailer');
const { fetchEmails, getUnreadCount } = require('../config/imap');
const { scoreEmail } = require('../utils/spam');
const { verifyAccessToken } = require('../middleware/auth');
const { mailLimiter } = require('../middleware/ratelimiter');
const { encryptMessage } = require('../utils/encryption');
const logger  = require('../utils/logger');

// All mail routes require auth
router.use(verifyAccessToken);

// ── POST /api/mail/send ──────────────────────────────────────────────
router.post('/send', mailLimiter, async (req, res) => {
  try {
    const { to, subject, body, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    // Spam check on outgoing (catch abuse)
    const spam = scoreEmail({ subject, text: body, from: process.env.SMTP_FROM });
    if (spam.isSpam) {
      return res.status(400).json({ error: 'Message flagged as spam', reasons: spam.reasons });
    }

    // Encrypt body if recipient has public key
    let bodyToStore = body;
    let isEncrypted = 0;

    const recipient = db.prepare(
      'SELECT public_key FROM users WHERE email = ?'
    ).get(Array.isArray(to) ? to[0] : to);

    if (recipient?.public_key) {
      bodyToStore = await encryptMessage(body, recipient.public_key);
      isEncrypted = 1;
      logger.info(`Email encrypted for ${to}`);
    }

    // Send via SMTP
    const info = await transporter.sendMail({
      from:    `"SecureMail" <${process.env.SMTP_FROM}>`,
      to,
      cc:      cc || undefined,
      bcc:     bcc || undefined,
      subject,
      text:    body,
      html:    `<div style="font-family:Arial,sans-serif">${body.replace(/\n/g, '<br>')}</div>`,
    });

    // Save to DB as sent
    db.prepare(`
      INSERT INTO emails (
        id, owner_id, from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, body_encrypted, is_encrypted, folder, status,
        message_id, sent_at
      ) VALUES (
        lower(hex(randomblob(16))), ?, ?, ?, ?, ?,
        ?, ?, ?, 'sent', 'sent',
        ?, datetime('now')
      )
    `).run(
      req.user.userId,
      process.env.SMTP_FROM,
      JSON.stringify(Array.isArray(to) ? to : [to]),
      JSON.stringify(cc ? [cc] : []),
      JSON.stringify(bcc ? [bcc] : []),
      subject,
      bodyToStore,
      isEncrypted,
      info.messageId || null,
    );

    logger.info(`Mail sent by ${req.user.email} to ${to}`);
    res.json({
      message: 'Email sent successfully',
      messageId: info.messageId,
      to,
      subject,
      encrypted: Boolean(isEncrypted),
    });
  } catch (err) {
    logger.error('Mail send error: ' + err.message);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// ── GET /api/mail/inbox ──────────────────────────────────────────────
router.get('/inbox', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    logger.info(`Fetching inbox for ${req.user.email}`);

    const emails = await fetchEmails(limit);

    // Spam score each email + save new ones to DB
    const processed = emails.map(email => {
      const spam = scoreEmail(email);

      // Save to DB if not already there (by messageId)
      if (email.messageId) {
        const exists = db.prepare(
          'SELECT id FROM emails WHERE message_id = ?'
        ).get(email.messageId);

        if (!exists) {
          db.prepare(`
            INSERT OR IGNORE INTO emails (
              id, owner_id, from_address, to_addresses,
              subject, body_encrypted, is_encrypted,
              folder, status, is_spam, spam_score,
              message_id, received_at
            ) VALUES (
              lower(hex(randomblob(16))), ?, ?, ?,
              ?, ?, 0,
              ?, 'received', ?, ?,
              ?, datetime('now')
            )
          `).run(
            req.user.userId,
            email.from,
            JSON.stringify([email.to]),
            email.subject,
            email.text || '',
            spam.isSpam ? 'spam' : 'inbox',
            spam.isSpam ? 1 : 0,
            spam.score,
            email.messageId,
          );
        }
      }

      return {
        ...email,
        spam: {
          score: spam.score,
          label: spam.label,
          isSpam: spam.isSpam,
        },
      };
    });

    res.json({
      total: processed.length,
      emails: processed,
    });
  } catch (err) {
    logger.error('Inbox fetch error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch inbox: ' + err.message });
  }
});

// ── GET /api/mail/sent ───────────────────────────────────────────────
router.get('/sent', (req, res) => {
  try {
    const emails = db.prepare(`
      SELECT id, from_address, to_addresses, subject,
             status, sent_at, created_at, is_encrypted
      FROM emails
      WHERE owner_id = ? AND folder = 'sent'
      ORDER BY sent_at DESC
      LIMIT 50
    `).all(req.user.userId);

    res.json({
      total: emails.length,
      emails: emails.map(e => ({
        ...e,
        to_addresses: JSON.parse(e.to_addresses || '[]'),
        encrypted: Boolean(e.is_encrypted),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

// ── GET /api/mail/unread ─────────────────────────────────────────────
router.get('/unread', async (req, res) => {
  try {
    const count = await getUnreadCount();
    res.json({ unread: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ── GET /api/mail/spam ───────────────────────────────────────────────
router.get('/spam', (req, res) => {
  try {
    const emails = db.prepare(`
      SELECT id, from_address, to_addresses, subject,
             spam_score, received_at
      FROM emails
      WHERE owner_id = ? AND is_spam = 1
      ORDER BY received_at DESC
      LIMIT 50
    `).all(req.user.userId);

    res.json({
      total: emails.length,
      emails: emails.map(e => ({
        ...e,
        to_addresses: JSON.parse(e.to_addresses || '[]'),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch spam emails' });
  }
});

// ── DELETE /api/mail/:id ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const email = db.prepare(
      'SELECT id FROM emails WHERE id = ? AND owner_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    db.prepare(
      "UPDATE emails SET folder = 'trash' WHERE id = ?"
    ).run(req.params.id);

    res.json({ message: 'Email moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ── PATCH /api/mail/:id/read ─────────────────────────────────────────
router.patch('/:id/read', (req, res) => {
  try {
    db.prepare(
      'UPDATE emails SET is_read = 1 WHERE id = ? AND owner_id = ?'
    ).run(req.params.id, req.user.userId);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;