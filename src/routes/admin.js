const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

// Protect all routes to Admin or Manager only
router.use(requireAuth);
router.use(requireRole('admin', 'manager'));

// --- STATS ---
router.get('/stats', async (req, res) => {
  try {
    const users = await prisma.user.count();
    const orders = await prisma.order.count();
    const revenue = await prisma.order.aggregate({ _sum: { price: true }, where: { status: 'completed' } });
    
    const pendingApps = await prisma.boosterApplication.count({ where: { status: 'pending' } });
    const pendingPayouts = await prisma.payout.count({ where: { status: 'pending' } });
    
    const boosters = await prisma.user.count({ where: { role: 'booster' } });
    const customers = await prisma.user.count({ where: { role: 'customer' } });
    const currentOrders = await prisma.order.count({ where: { status: 'in_progress' } });
    const pendingOrders = await prisma.order.count({ where: { status: 'pending' } });

    // --- TODAY'S STATS ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Orders Today
    const ordersToday = await prisma.order.count({
      where: { createdAt: { gte: todayStart } }
    });

    // Earnings Today (20% share)
    const completedToday = await prisma.order.aggregate({
      _sum: { price: true },
      where: { status: 'completed', completedAt: { gte: todayStart } }
    });
    const earningsToday = (completedToday._sum.price || 0) * 0.20;

    res.json({
      users,
      orders,
      revenue: revenue._sum.price || 0,
      pendingApps,
      pendingPayouts,
      boosters,
      customers,
      currentOrders,
      pendingOrders,
      ordersToday,
      earningsToday
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- BOOSTER APPLICATIONS ---
router.get('/applications', async (req, res) => {
  try {
    const apps = await prisma.boosterApplication.findMany({
      where: { status: 'pending' },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(apps);
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

router.put('/applications/:id/approve', async (req, res) => {
  try {
    const app = await prisma.boosterApplication.update({
      where: { id: req.params.id },
      data: { status: 'approved' }
    });
    await prisma.user.update({
      where: { id: app.userId },
      data: { role: 'booster' }
    });
    res.json({ message: 'Booster approved!' });
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

router.put('/applications/:id/reject', async (req, res) => {
  try {
    await prisma.boosterApplication.update({
      where: { id: req.params.id },
      data: { status: 'rejected' }
    });
    res.json({ message: 'Application rejected.' });
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

// --- PAYOUTS ---
router.get('/payouts', async (req, res) => {
  try {
    const payouts = await prisma.payout.findMany({
      where: { status: 'pending' },
      include: { user: { select: { username: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(payouts);
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

router.put('/payouts/:id/approve', async (req, res) => {
  try {
    await prisma.payout.update({
      where: { id: req.params.id },
      data: { status: 'completed' }
    });
    res.json({ message: 'Payout marked as paid.' });
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

router.put('/payouts/:id/reject', async (req, res) => {
  try {
    const payout = await prisma.payout.update({
      where: { id: req.params.id },
      data: { status: 'rejected' }
    });
    // Refund the user's wallet
    await prisma.user.update({
      where: { id: payout.userId },
      data: { walletBalance: { increment: payout.amount } }
    });
    res.json({ message: 'Payout rejected and refunded.' });
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

// --- ALL ORDERS (JDID) ---
router.get('/orders', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { username: true, email: true } },
        booster: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (err) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- USERS ---
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, walletBalance: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

// Only 'admin' can change roles, not managers
router.put('/users/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'booster', 'admin', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { role }
    });
    res.json({ message: 'Role updated.' });
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

// --- SUPPORT TICKETS ---
router.get('/tickets', async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(tickets);
  } catch (err) { 
    res.status(500).json({ error: 'Server error.' }); 
  }
});

module.exports = router;