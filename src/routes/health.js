const router = require('express').Router();
const db = require('../config/db');

router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/deep', (req, res) => {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (_) {}

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    checks: { db: dbOk, session: true },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;