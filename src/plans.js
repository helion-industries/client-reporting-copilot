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

  // ── Agency Suite bundle plans (includes SOW Copilot) ──
  suite_starter: {
    id: 'suite_starter',
    name: 'Suite Starter',
    price: 9900, // $99/month in cents
    priceId: 'price_1TI8h2Fg4i5P8k1Rk3Ygwh1y',
    stripe_price_id: 'price_1TI8h2Fg4i5P8k1Rk3Ygwh1y',
    interval: 'month',
    client_limit: 3,
    clientLimit: 3,
    isSuite: true,
  },
  suite_growth: {
    id: 'suite_growth',
    name: 'Suite Growth',
    price: 24900, // $249/month in cents
    priceId: 'price_1TI8h3Fg4i5P8k1R8SPAsbaK',
    stripe_price_id: 'price_1TI8h3Fg4i5P8k1R8SPAsbaK',
    interval: 'month',
    client_limit: 15,
    clientLimit: 15,
    isSuite: true,
  },
  suite_agency: {
    id: 'suite_agency',
    name: 'Suite Agency',
    price: 49900, // $499/month in cents
    priceId: 'price_1TI8h3Fg4i5P8k1R62hIC3Td',
    stripe_price_id: 'price_1TI8h3Fg4i5P8k1R62hIC3Td',
    interval: 'month',
    client_limit: null, // unlimited
    clientLimit: null,
    isSuite: true,
  },
};

const PAID_PLANS = [PLANS.starter, PLANS.growth, PLANS.agency];
const SUITE_PLANS = [PLANS.suite_starter, PLANS.suite_growth, PLANS.suite_agency];

module.exports = { PLANS, PAID_PLANS, SUITE_PLANS };
