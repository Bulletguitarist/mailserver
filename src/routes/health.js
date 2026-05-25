const router = require('express').Router();
const { pool } = require('../config/db');

router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/deep', async (req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (_) {}

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    checks: { db: dbOk, session: true },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;