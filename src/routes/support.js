const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'BOOSTIFY_ADMIN_SUPER_SECRET_2026';

// 1. Visiteur yeb3ath message (awel message)
router.post('/', async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message is required.' });

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        name: name || 'Anonymous',
        email: email || 'No email',
        message: message,
        messages: {
            create: { sender: 'customer', text: message }
        }
      }
    });
    res.status(201).json({ message: 'Ticket created.', ticket });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// 2. L'User w l'Admin yjibou l'Chat mte3 ticket
router.get('/:id', async (req, res) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// 3. L'Admin ychouf l'tickets l'kol
router.get('/', async (req, res) => {
  const isAdminSession = req.isAuthenticated && req.isAuthenticated() && req.user.role === 'admin';
  const isSecretValid = req.headers['x-admin-secret'] === ADMIN_SECRET;

  if (!isAdminSession && !isSecretValid) return res.status(403).json({ error: 'Access denied.' });

  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// 4. Nzidou Message fil Chat (Admin wala Customer)
router.post('/:id/reply', async (req, res) => {
    const { reply } = req.body; // aw text
    if (!reply) return res.status(400).json({ error: 'Message cannot be empty.' });

    const isAdminSession = req.isAuthenticated && req.isAuthenticated() && req.user.role === 'admin';
    const isSecretValid = req.headers['x-admin-secret'] === ADMIN_SECRET;
    const sender = (isAdminSession || isSecretValid) ? 'admin' : 'customer';

    try {
        await prisma.supportTicket.update({
            where: { id: req.params.id },
            data: {
                status: sender === 'admin' ? 'replied' : 'open',
                messages: {
                    create: { sender: sender, text: String(reply) }
                }
            }
        });
        res.json({ message: 'Message sent!' });
    } catch (err) { res.status(500).json({ error: 'Could not send message.' }); }
});

module.exports = router;