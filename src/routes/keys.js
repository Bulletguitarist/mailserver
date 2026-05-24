const router = require('express').Router();
const db     = require('../config/db');
const { generateKeyPair } = require('../utils/encryption');
const { verifyAccessToken } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(verifyAccessToken);

// ── POST /api/keys/generate ──────────────────────────────────────────
// Generate keypair — public key saved to DB, private key returned ONCE
router.post('/generate', async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.public_key) {
      return res.status(400).json({
        error: 'Keypair already exists. Regenerating will make old encrypted emails unreadable.',
        hint: 'Use /api/keys/regenerate to force regenerate'
      });
    }

    const { publicKey, privateKey } = await generateKeyPair();

    // Save ONLY public key to DB
    db.prepare('UPDATE users SET public_key = ? WHERE id = ?')
      .run(publicKey, user.id);

    logger.info(`Keypair generated for ${user.email}`);

    // Private key returned ONCE — user must save it!
    res.json({
      message: 'Keypair generated successfully',
      publicKey,
      privateKey,  // ⚠️ Save this! Never sent again!
      warning: 'Save your private key securely! It will NOT be shown again. Without it, encrypted emails cannot be decrypted.',
    });
  } catch (err) {
    logger.error('Key generation error: ' + err.message);
    res.status(500).json({ error: 'Key generation failed' });
  }
});

// ── POST /api/keys/regenerate ────────────────────────────────────────
router.post('/regenerate', async (req, res) => {
  try {
    const { publicKey, privateKey } = await generateKeyPair();

    db.prepare('UPDATE users SET public_key = ? WHERE id = ?')
      .run(publicKey, req.user.userId);

    res.json({
      message: 'Keypair regenerated',
      publicKey,
      privateKey,
      warning: 'Old encrypted emails are now UNREADABLE. Save this private key!',
    });
  } catch (err) {
    res.status(500).json({ error: 'Regeneration failed' });
  }
});

// ── GET /api/keys/public/:email ──────────────────────────────────────
// Get someone's public key (to encrypt email for them)
router.get('/public/:email', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT email, public_key FROM users WHERE email = ?'
    ).get(req.params.email.toLowerCase());

    if (!user || !user.public_key) {
      return res.status(404).json({ error: 'User not found or no public key' });
    }

    res.json({
      email: user.email,
      publicKey: user.public_key,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

// ── GET /api/keys/status ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT public_key FROM users WHERE id = ?'
    ).get(req.user.userId);

    res.json({
      hasKeys: Boolean(user?.public_key),
      publicKey: user?.public_key || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check key status' });
  }
});

module.exports = router;