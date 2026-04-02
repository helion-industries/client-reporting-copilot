'use strict';

const { PLANS } = require('./plans');

/**
 * requirePlan middleware — enforces client creation limits based on subscription.
 * Attaches req.subscription.
 * Must be used with a db instance passed in.
 */
function createRequirePlan(db) {
  const selectSubscription = db.prepare(
    'SELECT * FROM subscriptions WHERE agency_id = ?'
  );
  const countClients = db.prepare(
    'SELECT COUNT(*) AS total FROM clients WHERE agency_id = ? AND archived_at IS NULL'
  );

  return function requirePlan(req, res, next) {
    const agencyId = req.auth?.sub;
    if (!agencyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sub = selectSubscription.get(agencyId) || {
      plan_id: 'free',
      status: 'active',
    };

    req.subscription = sub;

    const plan = PLANS[sub.plan_id] || PLANS.free;
    const { total } = countClients.get(agencyId);

    if (plan.client_limit !== null && total >= plan.client_limit) {
      const msg =
        plan.id === 'free'
          ? 'Client limit reached. Upgrade to Starter or Pro to add more clients.'
          : `Client limit reached (${plan.client_limit} on ${plan.name} plan). Upgrade to Pro for unlimited clients.`;
      return res.status(403).json({
        error: msg,
        upgrade_required: true,
      });
    }

    return next();
  };
}

module.exports = { createRequirePlan };
