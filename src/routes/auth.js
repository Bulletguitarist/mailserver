const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { blockToken, setSession, getSession } = require('../config/sessions');
const { authLimiter } = require('../middleware/rateLimiter');
const { verifyAccessToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// ── Helpers ──────────────────────────────────────────────────────────

const generateTokens = (user) => {
  const jti = uuidv4();

  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      otpVerified: user.otp_enabled ? false : true,
      jti,
    },
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

const logAudit = (userId, action, req, metadata = {}) => {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, ip_address, user_agent, metadata)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      req.ip || req.connection.remoteAddress,
      req.headers['user-agent'] || '',
      JSON.stringify(metadata)
    );
  } catch (err) {
    logger.error('Audit log failed: ' + err.message);
  }
};

// ── POST /api/auth/register ──────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Insert user
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?)
    `).run(email.toLowerCase(), password_hash, display_name || null);

    // Fetch inserted user
    const userId = db.prepare(
      'SELECT id, email, display_name, created_at FROM users WHERE email = ?'
    ).get(email.toLowerCase());

    logAudit(userId.id, 'login_success', req, { action: 'register' });
    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: userId.id,
        email: userId.email,
        display_name: userId.display_name,
      },
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logAudit(user.id, 'login_failed', req, { reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken, jti } = generateTokens(user);
    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);

    logAudit(user.id, 'login_success', req);
    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        otp_enabled: Boolean(user.otp_enabled),
      },
      requiresOtp: Boolean(user.otp_enabled),
    });
  } catch (err) {
    logger.error('Login error: ' + err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const session = getSession(`refresh:${decoded.jti}`);
    if (!session) {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    blockToken(decoded.jti);
    const { accessToken, refreshToken: newRefresh, jti } = generateTokens(user);
    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────
router.post('/logout', verifyAccessToken, (req, res) => {
  try {
    blockToken(req.user.jti);
    logAudit(req.user.userId, 'logout', req);
    logger.info(`User logged out: ${req.user.email}`);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── POST /api/auth/otp/setup ─────────────────────────────────────────
router.post('/otp/setup', verifyAccessToken, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.otp_enabled) {
      return res.status(400).json({ error: 'OTP already enabled' });
    }

    const secret = speakeasy.generateSecret({
      name: `SecureMail (${user.email})`,
      issuer: 'SecureMail',
      length: 20,
    });

    db.prepare('UPDATE users SET otp_secret = ? WHERE id = ?')
      .run(secret.base32, user.id);

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    logAudit(user.id, 'otp_setup', req);

    res.json({
      message: 'Scan QR code with Google Authenticator or Authy',
      secret: secret.base32,
      qrCode,
    });
  } catch (err) {
    logger.error('OTP setup error: ' + err.message);
    res.status(500).json({ error: 'OTP setup failed' });
  }
});

// ── POST /api/auth/otp/verify ────────────────────────────────────────
router.post('/otp/verify', verifyAccessToken, (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'OTP token required' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user || !user.otp_secret) {
      return res.status(400).json({ error: 'OTP not set up' });
    }

    const valid = speakeasy.totp.verify({
      secret: user.otp_secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!valid) {
      logAudit(user.id, 'otp_failed', req);
      return res.status(401).json({ error: 'Invalid OTP token' });
    }

    db.prepare(`
      UPDATE users SET otp_enabled = 1, otp_verified_at = datetime('now') WHERE id = ?
    `).run(user.id);

    const { refreshToken, jti } = generateTokens({ ...user, otp_enabled: 1 });
    const newAccess = jwt.sign(
      { userId: user.id, email: user.email, otpVerified: true, jti },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
    );

    setSession(`refresh:${jti}`, { userId: user.id }, 7 * 24 * 60 * 60);
    logAudit(user.id, 'otp_verified', req);

    res.json({
      message: 'OTP verified successfully',
      accessToken: newAccess,
      refreshToken,
    });
  } catch (err) {
    logger.error('OTP verify error: ' + err.message);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ── GET /api/auth/activity ───────────────────────────────────────────
router.get('/activity', verifyAccessToken, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT action, ip_address, user_agent, metadata, created_at
      FROM audit_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(req.user.userId);

    res.json({
      activity: logs.map(log => ({
        ...log,
        metadata: JSON.parse(log.metadata || '{}'),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────
router.get('/me', verifyAccessToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, display_name, otp_enabled, is_active, created_at
      FROM users WHERE id = ?
    `).get(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user: { ...user, otp_enabled: Boolean(user.otp_enabled) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;