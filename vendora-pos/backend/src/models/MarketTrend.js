'use strict';
const { Schema, model } = require('mongoose');

const SeasonalFactorSchema = new Schema({
  month:      { type: Number, min: 1, max: 12 },
  multiplier: { type: Number, default: 1.0 },
}, { _id: false });

const MarketTrendSchema = new Schema({
  category:    { type: String, required: true, index: true },
  productName: { type: String, required: true },
  brand:       String,
  barcode:     String,
  trendScore:  { type: Number, min: 0, max: 100, default: 50 },
  trendDirection: {
    type: String,
    enum: ['rising', 'falling', 'stable', 'viral', 'new'],
    default: 'stable',
  },
  searchVolume:       { type: Number, default: 0 },
  searchVolumeChange: { type: Number, default: 0 }, // % vs last month
  avgRetailPrice:     Number,
  estimatedCostPrice: Number,
  estimatedMargin:    Number, // %
  suggestedSupplier:  String,
  relevantFor: {
    type: [String],
    default: ['off_licence', 'convenience', 'newsagent'],
  },
  region: { type: String, default: 'UK' },
  source: {
    type: String,
    enum: ['google_trends', 'internal', 'manual', 'ai'],
    default: 'manual',
  },
  seasonalFactors: [SeasonalFactorSchema],
  tags: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

MarketTrendSchema.index({ trendScore: -1 });
MarketTrendSchema.index({ category: 1, trendScore: -1 });
MarketTrendSchema.index({ trendDirection: 1 });

module.exports = model('MarketTrend', MarketTrendSchema);
