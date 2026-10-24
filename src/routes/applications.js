const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.post('/', async (req, res) => {
  const { fullName, game, rank, proofLink, experience } = req.body || {};
  
  if (!fullName || !game || !rank || !proofLink || !experience) {
    return res.status(400).json({ error: 'Missing fields.' });
  }
  
  try {
    const app = await prisma.boosterApplication.create({
      data: {
        userId: req.user.id,
        fullName: String(fullName).slice(0, 100),
        game: String(game).slice(0, 50),
        rank: String(rank).slice(0, 100),
        proofLink: String(proofLink).slice(0, 500),
        experience: String(experience).slice(0, 2000),
        status: 'pending',
      },
    });
    res.status(201).json({ message: 'Application submitted.', application: app });
  } catch (err) {
    console.error('Application error:', err);
    res.status(500).json({ error: 'Could not save application.' });
  }
});

module.exports = router;