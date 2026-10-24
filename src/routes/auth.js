const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';

// ---- Register ----
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Invalid registration data (min 8-char password).' });
  }
  try {
    const cleanEmail = String(email).toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username: String(username).slice(0, 30),
        email: cleanEmail,
        password: hash,
      },
    });

    res.status(201).json({
      message: 'Registered.',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// ---- Local login ----
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: (info && info.message) || 'Invalid credentials.' });
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({ user });
    });
  })(req, res, next);
});

// ---- Session check ----
router.get('/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.json({ user: req.user });
  }
  res.status(401).json({ error: 'Not authenticated.' });
});

// ---- Logout ----
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

// ---- UPDATE PROFILE (Username / Email) ----
router.put('/profile', requireAuth, async (req, res) => {
  const { username, email } = req.body || {};
  
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required.' });
  }

  try {
    const cleanEmail = String(email).toLowerCase().trim();
    
    // Check if email is used by another user
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'This email is already in use.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        username: String(username).slice(0, 30),
        email: cleanEmail,
      },
    });

    res.json({
      message: 'Profile updated successfully.',
      user: { 
        id: updatedUser.id, 
        username: updatedUser.username, 
        email: updatedUser.email, 
        role: updatedUser.role, 
        walletBalance: updatedUser.walletBalance 
      },
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

// ---- CHANGE PASSWORD ----
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Cannot change password for OAuth accounts.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hash },
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

// ---- TOP UP WALLET (Stripe Checkout) ----
router.post('/top-up-request', requireAuth, async (req, res) => {
  const { amount } = req.body || {};
  
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 10 || numAmount > 1000) {
    return res.status(400).json({ error: 'Amount must be between €10 and €1000.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'Boostify Wallet Top-up' },
          unit_amount: Math.round(numAmount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/add-funds.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/add-funds.html?canceled=true`,
      metadata: { userId: req.user.id, amount: numAmount },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe Checkout error:', err);
    res.status(500).json({ error: 'Could not create checkout session.' });
  }
});

// ---- Confirm Top-up (Stripe Verification) ----
router.post('/confirm-topup', requireAuth, async (req, res) => {
  const { session_id } = req.body || {};
  
  if (!session_id) {
    return res.status(400).json({ error: 'Missing session ID.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment was not successful.' });
    }

    if (session.metadata.userId !== req.user.id) {
      return res.status(403).json({ error: 'This payment does not belong to you.' });
    }

    const existingTx = await prisma.transaction.findUnique({
        where: { stripeSessionId: session.id }
    });
    if (existingTx) {
        return res.json({ message: 'Funds already added.', newBalance: req.user.walletBalance });
    }

    const numAmount = Number(session.metadata.amount);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { walletBalance: { increment: numAmount } }
    });

    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        amount: numAmount,
        type: 'top-up',
        stripeSessionId: session.id
      }
    });

    res.json({ message: 'Funds added successfully!', newBalance: user.walletBalance });
  } catch (err) {
    console.error('Top-up confirm error:', err);
    res.status(500).json({ error: 'Could not verify payment.' });
  }
});

// ---- Discord OAuth ----
router.get('/discord', passport.authenticate('discord', { scope: ['identify', 'email'] }));
router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${FRONTEND_URL}/signin.html?error=oauth`,
  }),
  (req, res) => res.redirect(`${FRONTEND_URL}/auth-success.html`)
);

// ---- Google OAuth ----
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${FRONTEND_URL}/signin.html?error=oauth`,
  }),
  (req, res) => res.redirect(`${FRONTEND_URL}/auth-success.html`)
);

module.exports = router;