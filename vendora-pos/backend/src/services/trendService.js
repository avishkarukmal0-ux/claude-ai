'use strict';

const NodeCache = require('node-cache');
const MarketTrend = require('../models/MarketTrend');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Store = require('../models/Store');
const logger = require('../utils/logger');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Cache: 24-hour TTL for Google Trends data
const trendCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// ── Keywords to track ─────────────────────────────────────────────────────────
const TRACKED_KEYWORDS = [
  'Energy drinks', 'Prime drink', 'Protein bars', 'Alcohol free beer',
  'Vapes', 'Disposable vapes', 'Oat milk', 'CBD', 'Health snacks',
  'Sparkling water', 'Crisps', 'Chocolate', 'Lottery', 'Phone top up',
  'Tobacco alternatives', 'Kombucha', 'Sports drinks', 'Soft drinks',
  'Beer', 'Spirits', 'Wine', 'Cider',
];

// ── Seasonal calendar ─────────────────────────────────────────────────────────
const SEASONAL_CALENDAR = [
  {
    name: 'Dry January',
    months: [1],
    startDay: 1, endDay: 31,
    products: ['Alcohol-free beer', 'Sparkling water', 'Kombucha', 'Herbal tea', 'Mocktail ingredients'],
    uplift: { 'Alcohol-free beer': 180, 'Kombucha': 60, 'Sparkling water': 40 },
    tags: ['health', 'alcohol_free'],
  },
  {
    name: "Valentine's Day",
    months: [2],
    startDay: 7, endDay: 14,
    products: ['Chocolates', 'Wine', 'Champagne', 'Prosecco', 'Roses', 'Gift bags'],
    uplift: { 'Chocolates': 120, 'Wine': 80, 'Champagne': 200, 'Prosecco': 150 },
    tags: ['gifting', 'romantic'],
  },
  {
    name: 'Ramadan',
    months: [3, 4],
    startDay: 1, endDay: 30,
    products: ['Dates', 'Halal snacks', 'Fruit juice', 'Coconut water', 'Dried fruits', 'Prayer beads'],
    uplift: { 'Dates': 300, 'Halal snacks': 150, 'Fruit juice': 80 },
    tags: ['ramadan', 'halal', 'religious'],
  },
  {
    name: 'Easter',
    months: [3, 4],
    startDay: 15, endDay: 30,
    products: ['Easter eggs', 'Chocolate', 'Hot cross buns', 'Cider'],
    uplift: { 'Easter eggs': 400, 'Chocolate': 150, 'Cider': 60 },
    tags: ['easter', 'chocolate', 'seasonal'],
  },
  {
    name: 'Summer BBQ Season',
    months: [5, 6, 7, 8],
    startDay: 1, endDay: 31,
    products: ['Beer', 'Cider', 'Cold drinks', 'Ice cream', 'BBQ snacks', 'Lemonade', 'Water'],
    uplift: { 'Beer': 80, 'Cider': 90, 'Cold drinks': 120, 'Water': 100 },
    tags: ['summer', 'bbq', 'outdoor'],
  },
  {
    name: 'Halloween',
    months: [10],
    startDay: 20, endDay: 31,
    products: ['Sweets', 'Chocolate', 'Haribo', 'Pumpkin snacks', 'Cider'],
    uplift: { 'Sweets': 250, 'Chocolate': 130, 'Haribo': 200 },
    tags: ['halloween', 'sweets', 'seasonal'],
  },
  {
    name: 'Bonfire Night',
    months: [11],
    startDay: 1, endDay: 7,
    products: ['Hot chocolate', 'Mulled wine', 'Jacket potato', 'Toffee apples', 'Sparklers'],
    uplift: { 'Hot chocolate': 150, 'Mulled wine': 200 },
    tags: ['bonfire', 'hot_drinks', 'fireworks'],
  },
  {
    name: 'Christmas',
    months: [12],
    startDay: 1, endDay: 31,
    products: ['Wine', 'Spirits', 'Chocolates', 'Mince pies', 'Champagne', 'Prosecco', 'Beer', 'Crisps'],
    uplift: { 'Wine': 150, 'Spirits': 120, 'Chocolates': 180, 'Champagne': 300 },
    tags: ['christmas', 'gifting', 'festive'],
  },
];

// ── fetchGoogleTrends ─────────────────────────────────────────────────────────
async function fetchGoogleTrends(keywords) {
  const cacheKey = `google_trends_${keywords.sort().join('_').replace(/\s/g, '')}`;
  const cached = trendCache.get(cacheKey);
  if (cached) return cached;

  try {
    const googleTrends = require('google-trends-api');
    const results = [];

    for (const keyword of keywords) {
      try {
        const raw = await googleTrends.interestOverTime({
          keyword,
          startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          geo: 'GB',
        });
        const data = JSON.parse(raw);
        const timeline = data?.default?.timelineData || [];
        if (timeline.length === 0) continue;

        const values = timeline.map(t => t.value?.[0] ?? 0);
        const latest = values.slice(-4); // last ~4 weeks
        const prev = values.slice(-8, -4);
        const avgLatest = latest.reduce((s, v) => s + v, 0) / (latest.length || 1);
        const avgPrev = prev.reduce((s, v) => s + v, 0) / (prev.length || 1);

        const change = avgPrev > 0 ? Math.round(((avgLatest - avgPrev) / avgPrev) * 100) : 0;
        const score = Math.min(100, Math.round(avgLatest));

        results.push({ keyword, trend: avgLatest, change, score });
      } catch {
        // Skip individual keyword errors silently
      }
    }

    if (results.length > 0) {
      trendCache.set(cacheKey, results);
      return results;
    }
  } catch (err) {
    logger.warn('Google Trends API unavailable, using stored data:', err.message);
  }

  // Fallback: return stored MarketTrend data
  try {
    const stored = await MarketTrend.find({}).lean();
    const fallback = stored.map(t => ({
      keyword: t.productName,
      trend: t.searchVolume,
      change: t.searchVolumeChange,
      score: t.trendScore,
    }));
    trendCache.set(cacheKey, fallback);
    return fallback;
  } catch (err) {
    logger.warn('Google Trends: DB fallback also failed:', err.message);
    return [];
  }
}

// ── analyseShopGaps ───────────────────────────────────────────────────────────
async function analyseShopGaps(storeId) {
  const trendingProducts = await MarketTrend.find({ trendScore: { $gt: 60 } })
    .sort({ trendScore: -1 })
    .lean();

  const storeProducts = await Product.find({ store: storeId, isActive: true }, 'name barcode brand').lean();

  const storeNames = new Set(storeProducts.map(p => p.name.toLowerCase()));
  const storeBarcodes = new Set(storeProducts.map(p => p.barcode).filter(Boolean));

  const gaps = trendingProducts.filter(trend => {
    if (trend.barcode && storeBarcodes.has(trend.barcode)) return false;
    // Fuzzy name check — avoid flagging if name is very similar
    const tName = trend.productName.toLowerCase();
    for (const sName of storeNames) {
      if (sName.includes(tName.split(' ')[0]) || tName.includes(sName.split(' ')[0])) return false;
    }
    return true;
  });

  return gaps.map(g => ({
    ...g,
    estimatedWeeklyRevenue: g.avgRetailPrice
      ? Math.round(g.avgRetailPrice * 12 * (g.trendScore / 100) * 7 * 100) / 100
      : null,
    suggestedQty: Math.max(12, Math.round(g.trendScore / 5) * 6),
  }));
}

// ── getSeasonalAlerts ─────────────────────────────────────────────────────────
async function getSeasonalAlerts() {
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const alerts = [];

  for (const event of SEASONAL_CALENDAR) {
    for (const month of event.months) {
      // Build start/end dates for this year (and next if Dec→Jan)
      const year = now.getFullYear();
      const start = new Date(year, month - 1, event.startDay);
      const end = new Date(year, month - 1, event.endDay);

      // Also try next year if we've already passed this one
      const startNext = new Date(year + 1, month - 1, event.startDay);

      const candidate = start >= now ? start : startNext;
      const candidateEnd = start >= now ? end : new Date(year + 1, month - 1, event.endDay);

      if (candidate <= in60) {
        const daysUntil = Math.ceil((candidate - now) / (1000 * 60 * 60 * 24));
        const isActive = now >= start && now <= end;
        alerts.push({
          name: event.name,
          startDate: candidate.toISOString().split('T')[0],
          endDate: candidateEnd.toISOString().split('T')[0],
          daysUntil: Math.max(0, daysUntil),
          isActive,
          products: event.products,
          uplift: event.uplift,
          tags: event.tags,
        });
      }
    }
  }

  // Deduplicate by name, keep the soonest
  const seen = new Set();
  return alerts
    .filter(a => { if (seen.has(a.name)) return false; seen.add(a.name); return true; })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// ── getStoreTrends ─────────────────────────────────────────────────────────────
async function getStoreTrends(storeId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Aggregate sales by product for this month vs last month
  const [thisMonth, lastMonth] = await Promise.all([
    Sale.aggregate([
      { $match: { store: require('mongoose').Types.ObjectId.createFromHexString(String(storeId)), completedAt: { $gte: thirtyDaysAgo }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: { product: '$items.product', name: '$items.name' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    ]),
    Sale.aggregate([
      { $match: { store: require('mongoose').Types.ObjectId.createFromHexString(String(storeId)), completedAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: { product: '$items.product', name: '$items.name' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    ]),
  ]);

  const lastMap = {};
  for (const l of lastMonth) lastMap[String(l._id.product)] = l;

  const velocities = thisMonth.map(t => {
    const prev = lastMap[String(t._id.product)];
    const prevQty = prev?.qty || 0;
    const change = prevQty > 0 ? Math.round(((t.qty - prevQty) / prevQty) * 100) : 0;
    return { productId: t._id.product, name: t._id.name, thisMonthQty: t.qty, lastMonthQty: prevQty, change, revenue: Math.round(t.revenue * 100) / 100 };
  }).filter(v => Math.abs(v.change) >= 10 || v.thisMonthQty > 5);

  velocities.sort((a, b) => b.change - a.change);

  const rising = velocities.filter(v => v.change > 0).slice(0, 8);
  const falling = velocities.filter(v => v.change < 0).slice(-8).reverse();

  // Basic basket correlation (top co-purchases)
  const basketData = await Sale.aggregate([
    { $match: { store: require('mongoose').Types.ObjectId.createFromHexString(String(storeId)), completedAt: { $gte: thirtyDaysAgo }, status: 'completed', 'items.1': { $exists: true } } },
    { $project: { items: { $slice: ['$items', 5] } } },
    { $unwind: { path: '$items', includeArrayIndex: 'idx' } },
    { $group: { _id: '$_id', itemNames: { $push: '$items.name' } } },
    { $limit: 200 },
  ]);

  const pairCount = {};
  for (const sale of basketData) {
    const names = sale.itemNames;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = [names[i], names[j]].sort().join(' || ');
        pairCount[key] = (pairCount[key] || 0) + 1;
      }
    }
  }

  const totalSales = basketData.length || 1;
  const correlations = Object.entries(pairCount)
    .filter(([, c]) => c >= 3)
    .map(([pair, count]) => {
      const [a, b] = pair.split(' || ');
      return { productA: a, productB: b, count, confidence: Math.round((count / totalSales) * 100) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { rising, falling, correlations };
}

// ── generateAIInsights ────────────────────────────────────────────────────────
async function generateAIInsights(storeId) {
  if (!ANTHROPIC_API_KEY) return [];

  const cacheKey = `ai_insights_${storeId}`;
  const cached = trendCache.get(cacheKey);
  if (cached) return cached;

  try {
    const store = await Store.findById(storeId).lean();
    if (!store) return [];

    // Top 20 sellers (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const topSellersAgg = await Sale.aggregate([
      { $match: { store: require('mongoose').Types.ObjectId.createFromHexString(String(storeId)), completedAt: { $gte: thirtyDaysAgo }, status: 'completed' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' }, category: { $first: '$items.category' } } },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
    ]);

    const trends = await MarketTrend.find({ trendScore: { $gt: 50 } }).sort({ trendScore: -1 }).limit(15).lean();
    const gaps = await analyseShopGaps(storeId);
    const seasonal = await getSeasonalAlerts();

    const prompt = `Store name: ${store.name}
Store location: ${store.address?.line1 || ''}, ${store.address?.city || ''}, ${store.address?.postcode || ''}
Store type: Off-licence / Convenience

Top selling products (last 30 days):
${topSellersAgg.map(p => `- ${p._id} (${p.qty} units, £${p.revenue.toFixed(2)})`).join('\n')}

Market trends this week (UK):
${trends.map(t => `- ${t.productName} [${t.category}]: score ${t.trendScore}, ${t.trendDirection}, ${t.searchVolumeChange > 0 ? '+' : ''}${t.searchVolumeChange}% search volume`).join('\n')}

Stock gaps vs national trends (trending products NOT in store):
${gaps.slice(0, 8).map(g => `- ${g.productName} (score: ${g.trendScore}, est. £${g.estimatedWeeklyRevenue || 0}/week if stocked)`).join('\n')}

Upcoming seasonal events (next 60 days):
${seasonal.map(s => `- ${s.name} in ${s.daysUntil} days: stock ${s.products.slice(0, 3).join(', ')}`).join('\n')}

Give me 5 specific, actionable insights for this shop owner. For each insight include:
- title: short title
- description: what to do and why (2-3 sentences with specific data)
- estimatedImpact: estimated weekly revenue impact as string (e.g. "+£120/week")
- supplier: which supplier to order from (Booker, Bestway, Costco, etc.)
- action: one of "order", "promote", "clearance", "seasonal_prep", "price_change"
- urgency: "high", "medium", or "low"

Return ONLY a valid JSON array of exactly 5 insight objects. No markdown, no explanation.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: 'You are a retail market analyst specialising in UK convenience stores and off-licences. Give practical, specific advice. Return only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API: ${res.status}`);
    const data = await res.json();
    const raw = data.content?.[0]?.text || '[]';
    const clean = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const insights = JSON.parse(clean);

    // Cache for 23 hours (refreshed by cron at 3am)
    trendCache.set(cacheKey, insights, 82800);
    return insights;
  } catch (err) {
    logger.error('generateAIInsights error:', err.message);
    return [];
  }
}

// ── askMarketAI ───────────────────────────────────────────────────────────────
async function askMarketAI(storeId, question) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const store = await Store.findById(storeId).lean();
  const trends = await MarketTrend.find({ trendScore: { $gt: 40 } }).sort({ trendScore: -1 }).limit(20).lean();
  const seasonal = await getSeasonalAlerts();

  const context = `Store: ${store?.name || 'UK Convenience Store'}, ${store?.address?.city || 'UK'}
Current top trends: ${trends.map(t => `${t.productName} (${t.trendScore}/100)`).join(', ')}
Upcoming events: ${seasonal.map(s => `${s.name} in ${s.daysUntil} days`).join(', ')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1000,
      system: 'You are a retail market analyst for UK convenience stores. Give specific, actionable advice with data references. Be concise but helpful.',
      messages: [
        { role: 'user', content: `${context}\n\nQuestion: ${question}` },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude API: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

module.exports = {
  fetchGoogleTrends,
  analyseShopGaps,
  getSeasonalAlerts,
  generateAIInsights,
  askMarketAI,
  getStoreTrends,
  TRACKED_KEYWORDS,
  SEASONAL_CALENDAR,
};
