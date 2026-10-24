const express = require('express');
const axios = require('axios'); // Importé pour communiquer avec le bot Discord
const rateLimit = require('express-rate-limit');
const prisma = require('../config/prisma');
const { requireAuth, requireRole, normRole } = require('../middleware/auth');
const { buildOrder } = require('../pricing');

const router = express.Router();

// Toutes les routes /orders exigent une session valide
router.use(requireAuth);

const STAFF = ['booster', 'admin', 'manager'];
const isManager = (u) => ['admin', 'manager'].includes(normRole(u));
const str = (v, max = 60) => String(v ?? '').trim().slice(0, max);

// Anti-spam: 20 commandes / heure / IP
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de commandes. Réessayez plus tard.' },
});

// Notification vers le bot Python (port 5001), avec un secret partagé
async function notifyDiscordBot(orderData) {
  try {
    await axios.post(
      process.env.BOT_URL || 'http://127.0.0.1:5001/api/new-order',
      orderData,
      {
        headers: { 'x-bot-secret': process.env.BOT_SECRET || '' },
        timeout: 5000,
      }
    );
  } catch (error) {
    console.error('Échec de la notification du bot Discord :', error.message);
  }
}

// Statuts: "pending" (disponible) -> "in_progress" (claimed) -> "completed"

// Créer une commande (client connecté).
router.post('/create', createLimiter, async (req, res) => {
  const spec = buildOrder(req.body);
  if (spec.error) {
    return res.status(400).json({ error: spec.error });
  }

  try {
    // N'verifiw l'wallet w n'sejjlou l'commande fil nafs l'transaction
    const result = await prisma.$transaction(async (tx) => {
      
      // 1. N'fasa5ou l'flous mel wallet mte3 l'customer
      const deduction = await tx.user.updateMany({
        where: { 
          id: req.user.id,
          walletBalance: { gte: spec.price } // Verifi ken l'balance >= l'prix
        },
        data: { walletBalance: { decrement: spec.price } }
      });

      if (deduction.count === 0) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 2. N'sejjlou l'commande
      const newOrder = await tx.order.create({
        data: {
          userId: req.user.id,
          game: spec.game,
          currentRank: spec.currentRank,
          desiredRank: spec.desiredRank,
          price: spec.price,
          status: 'pending',
          paidWithWallet: true // 3lemna elli t5allset mel wallet
        },
      });

      return newOrder;
    });

    // 3. N'3aytou l'bot Discord (barra mel transaction)
    notifyDiscordBot({
      _id: result.id,
      game: result.game,
      service: spec.service,
      currentRank: result.currentRank,
      desiredRank: result.desiredRank,
      currentLP: spec.currentLP,
      queueType: spec.queueType,
      server: spec.server,
      price: result.price,
    });

    res.status(201).json({ message: 'Order created and wallet charged!', order: result });

  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({ error: 'Insufficient wallet balance. Please add funds to your wallet.' });
    }
    console.error('Erreur lors de la création de la commande :', err);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
});

// Commandes d'un client: lui-même, ou admin/manager
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    console.error('Erreur lors de la récupération des commandes utilisateur :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Commandes disponibles: réservé au staff, sans données du client
router.get('/available', requireRole(...STAFF), async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { boosterId: null, status: { not: 'completed' } },
      select: {
        id: true,
        game: true,
        currentRank: true,
        desiredRank: true,
        price: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    console.error('Erreur lors de la récupération des commandes disponibles :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Un booster ne voit que ses propres commandes (sauf admin/manager)
function ownBoosterOnly(req, res, next) {
  if (req.params.boosterId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  next();
}

// Commandes TERMINÉES d'un booster
router.get('/booster/:boosterId/completed', requireRole(...STAFF), ownBoosterOnly, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { boosterId: req.params.boosterId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    console.error('Erreur lors de la récupération des commandes terminées :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Commandes ACTIVES d'un booster
router.get('/booster/:boosterId', requireRole(...STAFF), ownBoosterOnly, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { boosterId: req.params.boosterId, status: { not: 'completed' } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    console.error('Erreur lors de la récupération des sessions actives du booster :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Transition atomique pour Claim et Unlock
async function transition(req, res, { where, data, message }) {
  try {
    const r = await prisma.order.updateMany({ where: { id: req.params.id, ...where }, data });
    if (r.count === 0) {
      return res.status(409).json({ error: 'Action impossible sur cette commande.' });
    }
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    res.json({ message, price: order.price, order });
  } catch (err) {
    console.error('Erreur transition commande :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// Claim: seulement si la commande est libre et en attente.
router.put('/:id/claim', requireRole(...STAFF), (req, res) =>
  transition(req, res, {
    where: { boosterId: null, status: 'pending' },
    data: { boosterId: req.user.id, status: 'in_progress' },
    message: 'Commande récupérée avec succès !',
  })
);

// Unlock: seulement par le booster qui l'a prise (ou admin/manager)
router.put('/:id/unlock', requireRole(...STAFF), (req, res) =>
  transition(req, res, {
    where: {
      status: 'in_progress',
      ...(isManager(req.user) ? {} : { boosterId: req.user.id }),
    },
    data: { boosterId: null, status: 'pending' },
    message: 'Order unlocked successfully',
  })
);

// COMPLETE: L'booster yakhou 70% mel flous w yetzadou fil wallet mte3ou
router.put('/:id/complete', requireRole(...STAFF), async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      
      // 1. Nchoufou l'commande w n'verifiw elli mazel in_progress w mte3 l'booster
      const order = await tx.order.findFirst({
        where: {
          id: req.params.id,
          status: 'in_progress',
          ...(isManager(req.user) ? {} : { boosterId: req.user.id }),
        }
      });

      if (!order) throw new Error('NOT_FOUND');

      // 2. N'beddlou l'status l completed
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: 'completed', completedAt: new Date() }
      });

      // 3. NZIDOU 70% MEL FLOUS FIL WALLET MTE3 L'BOOSTER
      if (order.boosterId) {
        const earnings = order.price * 0.70;
        await tx.user.update({
          where: { id: order.boosterId },
          data: { walletBalance: { increment: earnings } } 
        });
      }

      return updatedOrder;
    });

    res.json({ message: 'Order completed successfully', price: result.price, order: result });
  } catch (err) {
    if (err.message === 'NOT_FOUND') {
      return res.status(409).json({ error: 'Action impossible sur cette commande.' });
    }
    console.error('Erreur complete commande :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;