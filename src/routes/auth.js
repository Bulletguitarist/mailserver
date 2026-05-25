const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { blockToken, setSession, getSession } = require('../config/sessions');
const { authLimiter } = require('../middleware/ratelimiter');
const { verifyAccessToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const generateTokens = (user) => {
  const jti = uuidv4();
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, otpVerified: user.otp_enabled ? false : true, jti },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId: user.id, jti },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
  return { accessToken, refreshToken, jti };
};

const logAudit = async (userId, action, req, metadata = {}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), userId, action, req.ip || '', req.headers['user-agent'] || '', JSON.stringify(metadata)]
    );
  } catch (err) {
    logger.error('Audit log failed: ' + err.message);
  }
};

// ── POST /api/auth/register ──────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)`,
      [id, email.toLowerCase(), password_hash, display_name || null]
    );

    await logAudit(id, 'login_success', req, { action: 'register' });
    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'Account created successfully',
      user: { id, email: email.toLowerCase(), display_name: display_name || null },
    });
  } catch (err) {
    logger.error('Register error: ' + err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await logAudit(user.id, 'login_failed', req, { reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken, jti } = generateTokens(user);
    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);
    await logAudit(user.id, 'login_success', req);
    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, display_name: user.display_name, otp_enabled: Boolean(user.otp_enabled) },
      requiresOtp: Boolean(user.otp_enabled),
    });
  } catch (err) {
    logger.error('Login error: ' + err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const session = getSession(`refresh:${decoded.jti}`);
    if (!session) return res.status(401).json({ error: 'Session expired' });

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = result.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'User not found' });

    blockToken(decoded.jti);
    const { accessToken, refreshToken: newRefresh, jti } = generateTokens(user);
    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────
router.post('/logout', verifyAccessToken, async (req, res) => {
  try {
    blockToken(req.user.jti);
    await logAudit(req.user.userId, 'logout', req);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── POST /api/auth/otp/setup ─────────────────────────────────────────
router.post('/otp/setup', verifyAccessToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.otp_enabled) return res.status(400).json({ error: 'OTP already enabled' });

    const secret = speakeasy.generateSecret({ name: `SecureMail (${user.email})`, issuer: 'SecureMail', length: 20 });
    await pool.query('UPDATE users SET otp_secret = $1 WHERE id = $2', [secret.base32, user.id]);

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    await logAudit(user.id, 'otp_setup', req);

    res.json({ message: 'Scan QR code with Google Authenticator', secret: secret.base32, qrCode });
  } catch (err) {
    res.status(500).json({ error: 'OTP setup failed' });
  }
});

// ── POST /api/auth/otp/verify ────────────────────────────────────────
router.post('/otp/verify', verifyAccessToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'OTP token required' });

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];
    if (!user || !user.otp_secret) return res.status(400).json({ error: 'OTP not set up' });

    const valid = speakeasy.totp.verify({ secret: user.otp_secret, encoding: 'base32', token, window: 1 });
    if (!valid) {
      await logAudit(user.id, 'otp_failed', req);
      return res.status(401).json({ error: 'Invalid OTP token' });
    }

    await pool.query('UPDATE users SET otp_enabled = 1, otp_verified_at = $1 WHERE id = $2',
      [new Date().toISOString(), user.id]);

    const { refreshToken, jti } = generateTokens({ ...user, otp_enabled: 1 });
    const newAccess = jwt.sign(
      { userId: user.id, email: user.email, otpVerified: true, jti },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
    );

    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);
    await logAudit(user.id, 'otp_verified', req);

    res.json({ message: 'OTP verified', accessToken: newAccess, refreshToken });
  } catch (err) {
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ── GET /api/auth/activity ───────────────────────────────────────────
router.get('/activity', verifyAccessToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT action, ip_address, user_agent, metadata, created_at
       FROM audit_logs WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.userId]
    );
    res.json({
      activity: result.rows.map(log => ({
        ...log,
        metadata: JSON.parse(log.metadata || '{}'),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────
router.get('/me', verifyAccessToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, otp_enabled, is_active, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { ...user, otp_enabled: Boolean(user.otp_enabled) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;