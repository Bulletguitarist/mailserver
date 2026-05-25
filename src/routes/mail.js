const router  = require('express').Router();
const db      = require('../config/db');
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

    // Spam check
    const spam = scoreEmail({ subject, text: body, from: req.user.email });
    if (spam.isSpam) {
      return res.status(400).json({ error: 'Message flagged as spam', reasons: spam.reasons });
    }

    // Encrypt if recipient has public key
    let bodyToStore = body;
    let isEncrypted = 0;

    const recipient = db.prepare(
      'SELECT id, public_key FROM users WHERE email = ?'
    ).get(Array.isArray(to) ? to[0] : to);

    if (recipient?.public_key) {
      bodyToStore = await encryptMessage(body, recipient.public_key);
      isEncrypted = 1;
      logger.info(`Email encrypted for ${to}`);
    }

    const messageId = `<${Date.now()}-${Math.random().toString(36).slice(2)}@securemail>`;

    // Save to sender's sent folder
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
      req.user.email,
      JSON.stringify(Array.isArray(to) ? to : [to]),
      JSON.stringify(cc ? [cc] : []),
      JSON.stringify(bcc ? [bcc] : []),
      subject,
      bodyToStore,
      isEncrypted,
      messageId,
    );

    // Save to recipient's inbox if internal user
    if (recipient) {
      db.prepare(`
        INSERT INTO emails (
          id, owner_id, from_address, to_addresses,
          subject, body_encrypted, is_encrypted,
          folder, status, message_id, received_at
        ) VALUES (
          lower(hex(randomblob(16))), ?, ?, ?,
          ?, ?, ?,
          'inbox', 'received', ?, datetime('now')
        )
      `).run(
        recipient.id,
        req.user.email,
        JSON.stringify([to]),
        subject,
        bodyToStore,
        isEncrypted,
        messageId,
      );
      logger.info(`Internal mail delivered to ${to}`);
    }

    logger.info(`Mail sent by ${req.user.email} to ${to}`);
    res.json({
      message: recipient
        ? 'Email delivered internally!'
        : 'Email saved (recipient not on SecureMail)',
      messageId,
      to,
      subject,
      encrypted: Boolean(isEncrypted),
      internal: Boolean(recipient),
    });
  } catch (err) {
    logger.error('Mail send error: ' + err.message);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// ── GET /api/mail/inbox ──────────────────────────────────────────────
router.get('/inbox', (req, res) => {
  try {
    const emails = db.prepare(`
      SELECT id, from_address, to_addresses, subject,
             body_encrypted, is_encrypted, is_read,
             is_starred, spam_score, is_spam,
             folder, received_at, created_at
      FROM emails
      WHERE owner_id = ? AND folder = 'inbox'
      ORDER BY received_at DESC
      LIMIT 50
    `).all(req.user.userId);

    res.json({
      total: emails.length,
      emails: emails.map(e => ({
        ...e,
        to_addresses: JSON.parse(e.to_addresses || '[]'),
        encrypted: Boolean(e.is_encrypted),
        spam: {
          score: e.spam_score || 0,
          isSpam: Boolean(e.is_spam),
          label: e.spam_score >= 7 ? 'SPAM' : e.spam_score >= 4 ? 'SUSPICIOUS' : 'CLEAN',
        }
      })),
    });
  } catch (err) {
    logger.error('Inbox fetch error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// ── GET /api/mail/sent ───────────────────────────────────────────────
router.get('/sent', (req, res) => {
  try {
    const emails = db.prepare(`
      SELECT id, from_address, to_addresses, subject,
             status, is_encrypted, sent_at, created_at
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
router.get('/unread', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE owner_id = ? AND folder = 'inbox' AND is_read = 0
    `).get(req.user.userId);
    res.json({ unread: result.count });
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