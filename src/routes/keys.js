const router = require('express').Router();
const { pool } = require('../config/db');
const { generateKeyPair } = require('../utils/encryption');
const { verifyAccessToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

router.use(verifyAccessToken);

router.post('/generate', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.public_key) {
      return res.status(400).json({
        error: 'Keypair already exists.',
        hint: 'Use /api/keys/regenerate to force regenerate'
      });
    }

    const { publicKey, privateKey } = await generateKeyPair();
    await pool.query('UPDATE users SET public_key = $1 WHERE id = $2', [publicKey, user.id]);
    logger.info(`Keypair generated for ${user.email}`);

    res.json({
      message: 'Keypair generated successfully',
      publicKey,
      privateKey,
      warning: 'Save your private key! It will NOT be shown again.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Key generation failed' });
  }
});

router.post('/regenerate', async (req, res) => {
  try {
    const { publicKey, privateKey } = await generateKeyPair();
    await pool.query('UPDATE users SET public_key = $1 WHERE id = $2', [publicKey, req.user.userId]);
    res.json({ message: 'Keypair regenerated', publicKey, privateKey, warning: 'Old encrypted emails are now UNREADABLE.' });
  } catch (err) {
    res.status(500).json({ error: 'Regeneration failed' });
  }
});

router.get('/public/:email', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT email, public_key FROM users WHERE email = $1',
      [req.params.email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !user.public_key) return res.status(404).json({ error: 'User not found or no public key' });
    res.json({ email: user.email, publicKey: user.public_key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT public_key FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];
    res.json({ hasKeys: Boolean(user?.public_key), publicKey: user?.public_key || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check key status' });
  }
});

module.exports = router;