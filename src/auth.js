const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret';
}

function signToken(agency) {
  return jwt.sign(
    {
      sub: agency.id,
      email: agency.email,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.auth = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  authMiddleware,
  signToken,
  getJwtSecret,
};
