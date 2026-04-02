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
    client_limit: 3,
    stripe_price_id: 'price_1THtqAFg4i5P8k1Rq94NRcgU',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 14900, // $149/month in cents
    interval: 'month',
    client_limit: 15,
    stripe_price_id: 'price_1THtqZFg4i5P8k1Rwgyl0DSg',
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: 34900, // $349/month in cents
    interval: 'month',
    client_limit: null, // unlimited
    stripe_price_id: 'price_1THtrNFg4i5P8k1RxnKSdHwI',
  },
};

const PAID_PLANS = [PLANS.starter, PLANS.growth, PLANS.agency];

module.exports = { PLANS, PAID_PLANS };
