const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');

const isProd = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  console.error('[FATAL] SESSION_SECRET manquant ou trop court (min 16 caractères) dans .env');
  process.exit(1);
}

require('./config/passport');

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const applicationRoutes = require('./routes/applications');
const supportRoutes = require('./routes/support');
const paymentMethodRoutes = require('./routes/paymentMethods');
const adminRoutes = require('./routes/admin');


const app = express();

if (isProd) app.set('trust proxy', 1);

// Helmet sans CSP strict: sinon Tailwind / Google Fonts / Font Awesome CDN sont bloqués
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));

app.use(express.static(path.join(__dirname, '../../../frontend')));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use('/orders', orderRoutes);
app.use('/applications', applicationRoutes);
app.use('/support', supportRoutes);
app.use('/payment-methods', paymentMethodRoutes);
app.use('/admin', adminRoutes);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error('[Server error]', err);
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : err.message || 'Internal server error',
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled rejection]', reason);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});