const router  = require('express').Router();
const { pool } = require('../config/db');
const { scoreEmail } = require('../utils/spam');
const { verifyAccessToken } = require('../middleware/auth');
const { mailLimiter } = require('../middleware/ratelimiter');
const { encryptMessage } = require('../utils/encryption');
const { v4: uuidv4 } = require('uuid');
const logger  = require('../utils/logger');

router.use(verifyAccessToken);

// ── POST /api/mail/send ──────────────────────────────────────────────
router.post('/send', mailLimiter, async (req, res) => {
  try {
    const { to, subject, body, cc, bcc } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' });

    const spam = scoreEmail({ subject, text: body, from: req.user.email });
    if (spam.isSpam) return res.status(400).json({ error: 'Message flagged as spam', reasons: spam.reasons });

    let bodyToStore = body;
    let isEncrypted = 0;

    const recipientResult = await pool.query(
      'SELECT id, public_key FROM users WHERE email = $1',
      [Array.isArray(to) ? to[0] : to]
    );
    const recipient = recipientResult.rows[0];

    if (recipient?.public_key) {
      try {
        bodyToStore = await encryptMessage(body, recipient.public_key);
        isEncrypted = 1;
        logger.info(`Email encrypted for ${to}`);
      } catch (encErr) {
        logger.error('Encryption failed, sending plaintext: ' + encErr.message);
        bodyToStore = body;
        isEncrypted = 0;
      }
    }

    const messageId = `<${uuidv4()}@securemail>`;

    // Save to sender's sent folder
    await pool.query(
      `INSERT INTO emails (id, owner_id, from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, body_encrypted, is_encrypted, folder, status, message_id, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sent','sent',$10,to_char(now(),'YYYY-MM-DD HH24:MI:SS'))`,
      [
        uuidv4(), req.user.userId, req.user.email,
        JSON.stringify(Array.isArray(to) ? to : [to]),
        JSON.stringify(cc ? [cc] : []),
        JSON.stringify(bcc ? [bcc] : []),
        subject, bodyToStore, isEncrypted, messageId
      ]
    );

    // Save to recipient's inbox if internal user
    if (recipient) {
      await pool.query(
        `INSERT INTO emails (id, owner_id, from_address, to_addresses,
          subject, body_encrypted, is_encrypted, folder, status, message_id, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'inbox','received',$8,to_char(now(),'YYYY-MM-DD HH24:MI:SS'))`,
        [uuidv4(), recipient.id, req.user.email, JSON.stringify([to]), subject, bodyToStore, isEncrypted, messageId]
      );
      logger.info(`Internal mail delivered to ${to}`);
    }

    res.json({
      message: recipient ? 'Email delivered internally!' : 'Email saved (recipient not on SecureMail)',
      messageId, to, subject,
      encrypted: Boolean(isEncrypted),
      internal: Boolean(recipient),
    });
  } catch (err) {
    logger.error('Mail send error: ' + err.message);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});

// ── GET /api/mail/inbox ──────────────────────────────────────────────
router.get('/inbox', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, from_address, to_addresses, subject,
              body_encrypted, is_encrypted, is_read,
              is_starred, spam_score, is_spam,
              folder, received_at, created_at
       FROM emails
       WHERE owner_id = $1 AND folder = 'inbox'
       ORDER BY received_at DESC LIMIT 50`,
      [req.user.userId]
    );

    res.json({
      total: result.rows.length,
      emails: result.rows.map(e => ({
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
    logger.error('Inbox error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// ── GET /api/mail/sent ───────────────────────────────────────────────
router.get('/sent', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, from_address, to_addresses, subject,
              status, is_encrypted, sent_at, created_at
       FROM emails WHERE owner_id = $1 AND folder = 'sent'
       ORDER BY sent_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({
      total: result.rows.length,
      emails: result.rows.map(e => ({
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
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM emails WHERE owner_id = $1 AND folder = 'inbox' AND is_read = 0`,
      [req.user.userId]
    );
    res.json({ unread: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ── GET /api/mail/spam ───────────────────────────────────────────────
router.get('/spam', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, from_address, to_addresses, subject, spam_score, received_at
       FROM emails WHERE owner_id = $1 AND is_spam = 1
       ORDER BY received_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({
      total: result.rows.length,
      emails: result.rows.map(e => ({ ...e, to_addresses: JSON.parse(e.to_addresses || '[]') })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch spam' });
  }
});

// ── DELETE /api/mail/:id ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id FROM emails WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
    await pool.query("UPDATE emails SET folder = 'trash' WHERE id = $1", [req.params.id]);
    res.json({ message: 'Email moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ── PATCH /api/mail/:id/read ─────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE emails SET is_read = 1 WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;