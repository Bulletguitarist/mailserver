const jwt = require('jsonwebtoken');
const { isTokenBlocked } = require('../config/sessions');

const verifyAccessToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    if (isTokenBlocked(decoded.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireOtp = (req, res, next) => {
  if (!req.user?.otpVerified) {
    return res.status(403).json({ error: 'OTP verification required' });
  }
  next();
};

module.exports = { verifyAccessToken, requireOtp };