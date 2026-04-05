'use strict';

const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');

const TIER_THRESHOLDS = { bronze: 0, silver: 500, gold: 1500, platinum: 5000 };
const TIER_MULTIPLIERS = { bronze: 1, silver: 1.25, gold: 1.5, platinum: 2 };

function getTier(points) {
  if (points >= 5000) return 'platinum';
  if (points >= 1500) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
}

async function earnPoints(customerId, saleTotal, saleId, storeSettings) {
  const customer = await Customer.findById(customerId);
  if (!customer || !customer.loyalty.enrolled) return 0;

  const ppp = storeSettings.loyaltyPointsPerPound || 1;
  const multiplier = customer.loyalty.tierMultiplier || 1;
  const pointsEarned = Math.floor(saleTotal * ppp * multiplier);

  if (pointsEarned <= 0) return 0;

  customer.loyalty.points += pointsEarned;
  customer.loyalty.tier = getTier(customer.loyalty.points);
  customer.loyalty.tierMultiplier = TIER_MULTIPLIERS[customer.loyalty.tier] || 1;

  customer.loyalty.pointsHistory.push({
    type: 'earn',
    points: pointsEarned,
    balanceAfter: customer.loyalty.points,
    saleId,
    description: `Earned from sale £${saleTotal.toFixed(2)}`,
  });

  customer.stats.totalSpent = (customer.stats.totalSpent || 0) + saleTotal;
  customer.stats.totalTransactions = (customer.stats.totalTransactions || 0) + 1;
  customer.stats.averageTransactionValue =
    customer.stats.totalSpent / customer.stats.totalTransactions;
  customer.stats.lastPurchase = new Date();
  if (!customer.stats.firstPurchase) customer.stats.firstPurchase = new Date();

  await customer.save();
  return pointsEarned;
}

async function redeemPoints(customerId, pointsToRedeem, saleId, storeSettings) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw AppError.notFound('Customer');
  if (!customer.loyalty.enrolled) throw new AppError('Customer not enrolled in loyalty', 400, 'LOYALTY_NOT_ENROLLED');

  if (customer.loyalty.points < pointsToRedeem) {
    throw AppError.loyaltyInsufficient(pointsToRedeem, customer.loyalty.points);
  }

  const pointValue = storeSettings.loyaltyPointValue || 0.01;
  const monetaryValue = Math.round(pointsToRedeem * pointValue * 100) / 100;

  customer.loyalty.points -= pointsToRedeem;
  customer.loyalty.tier = getTier(customer.loyalty.points);

  customer.loyalty.pointsHistory.push({
    type: 'redeem',
    points: -pointsToRedeem,
    balanceAfter: customer.loyalty.points,
    saleId,
    description: `Redeemed ${pointsToRedeem} points for £${monetaryValue.toFixed(2)}`,
  });

  await customer.save();
  return { pointsRedeemed: pointsToRedeem, monetaryValue };
}

async function adjustPoints(customerId, points, reason, staffId) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw AppError.notFound('Customer');

  customer.loyalty.points = Math.max(0, customer.loyalty.points + points);
  customer.loyalty.tier = getTier(customer.loyalty.points);
  customer.loyalty.tierMultiplier = TIER_MULTIPLIERS[customer.loyalty.tier] || 1;

  customer.loyalty.pointsHistory.push({
    type: 'adjust',
    points,
    balanceAfter: customer.loyalty.points,
    description: reason || 'Manual adjustment',
  });

  await customer.save();
  return customer.loyalty.points;
}

async function getPointsBalance(customerId) {
  const customer = await Customer.findById(customerId).select('loyalty');
  if (!customer) throw AppError.notFound('Customer');
  return {
    points: customer.loyalty.points,
    tier: customer.loyalty.tier,
    tierMultiplier: customer.loyalty.tierMultiplier,
    enrolled: customer.loyalty.enrolled,
  };
}

async function getPointsHistory(customerId, limit = 20) {
  const customer = await Customer.findById(customerId).select('loyalty');
  if (!customer) throw AppError.notFound('Customer');
  const history = [...customer.loyalty.pointsHistory]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  return history;
}

module.exports = { earnPoints, redeemPoints, adjustPoints, getPointsBalance, getPointsHistory };
