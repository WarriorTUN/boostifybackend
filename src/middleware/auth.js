const normRole = (u) => String((u && u.role) || 'customer').toLowerCase().trim();

function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Non connecté.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(normRole(req.user))
      ? next()
      : res.status(403).json({ error: 'Accès refusé.' });
}

module.exports = { requireAuth, requireRole, normRole };