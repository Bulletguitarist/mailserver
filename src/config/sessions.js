const sessions = new Map();

const setSession = (key, value, ttlSeconds) => {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  sessions.set(key, { value, expiresAt });
};

const getSession = (key) => {
  const entry = sessions.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(key);
    return null;
  }
  return entry.value;
};

const deleteSession = (key) => sessions.delete(key);

const blocklist = new Set();
const blockToken = (jti) => blocklist.add(jti);
const isTokenBlocked = (jti) => blocklist.has(jti);

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessions.entries()) {
    if (now > entry.expiresAt) sessions.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = {
  setSession,
  getSession,
  deleteSession,
  blockToken,
  isTokenBlocked,
};