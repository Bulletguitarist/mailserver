require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const logger     = require('./utils/logger');
const { apiLimiter } = require('./middleware/ratelimiter');
const healthRouter   = require('./routes/health');
const { verifyMailer } = require('./config/mailer');
const { initDb } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://mailserver-ui.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));
app.use('/api/', apiLimiter);
app.set('trust proxy', 1);

app.use('/health',     healthRouter);
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/mail',   require('./routes/mail'));
app.use('/api/keys',   require('./routes/keys'));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ error: err.message });
});

const start = async () => {
  try {
    await initDb();
    await verifyMailer();
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start: ' + err.message);
    process.exit(1);
  }
};

start();