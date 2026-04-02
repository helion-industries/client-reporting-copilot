'use strict';

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: null,
    client_limit: 2,
    stripe_price_id: null,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 4900, // $49/month in cents
    interval: 'month',
    client_limit: 5,
    stripe_price_id: 'price_starter_placeholder',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 9900, // $99/month in cents
    interval: 'month',
    client_limit: null, // unlimited
    stripe_price_id: 'price_pro_placeholder',
  },
};

const PAID_PLANS = [PLANS.starter, PLANS.pro];

module.exports = { PLANS, PAID_PLANS };
