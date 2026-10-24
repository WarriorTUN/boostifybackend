const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /payouts (Historique)
router.get('/', async (req, res) => {
    try {
        const payouts = await prisma.payout.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(payouts);
    } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /payouts (Talab jdid)
router.post('/', async (req, res) => {
    const { amount, method } = req.body;
    const numAmount = Number(amount);
    
    if (!numAmount || numAmount < 10) return res.status(400).json({ error: 'Minimum payout is €10.' });

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Nfasa5ou l'flous mel wallet
            const deduction = await tx.user.updateMany({
                where: { id: req.user.id, walletBalance: { gte: numAmount } },
                data: { walletBalance: { decrement: numAmount } }
            });
            
            if (deduction.count === 0) throw new Error('INSUFFICIENT_FUNDS');

            // 2. Nsejjlou l'talab
            return tx.payout.create({
                data: { userId: req.user.id, amount: numAmount, method }
            });
        });
        res.status(201).json({ message: 'Payout requested!', payout: result });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Insufficient balance.' });
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;