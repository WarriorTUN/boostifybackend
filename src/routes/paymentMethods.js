const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /payment-methods - Jib l'methods mte3 l'user
router.get('/', async (req, res) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(methods);
  } catch (err) {
    console.error('GET methods error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /payment-methods - Zid method jdida
router.post('/', async (req, res) => {
  const { walletName, account } = req.body || {};
  if (!walletName || !account) {
    return res.status(400).json({ error: 'Wallet name and account are required.' });
  }
  try {
    const method = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        walletName: String(walletName).slice(0, 50),
        account: String(account).slice(0, 100),
      }
    });
    res.status(201).json(method);
  } catch (err) {
    console.error('POST method error:', err);
    res.status(500).json({ error: 'Could not save payment method.' });
  }
});

// DELETE /payment-methods/:id - Fasa5 method
router.delete('/:id', async (req, res) => {
  try {
    const method = await prisma.paymentMethod.findUnique({ where: { id: req.params.id } });
    if (!method || method.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    await prisma.paymentMethod.delete({ where: { id: req.params.id } });
    res.json({ message: 'Method removed.' });
  } catch (err) {
    console.error('DELETE method error:', err);
    res.status(500).json({ error: 'Could not delete method.' });
  }
});

module.exports = router;