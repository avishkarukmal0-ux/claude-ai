'use strict';

// Durable per-Output-Area census counts, keyed by (Nomis dataset, OA code). Census 2021 is STATIC, so a count
// once fetched from Nomis never changes — we persist it with NO expiry so only the first-ever fetch of an OA (for
// a given dataset) is ever slow, and that cost survives Render restarts and deploys (unlike the in-process cache).
// `counts` is the parsed breakdown for that OA ({ label: number }); an empty object means "we asked Nomis and it
// returned nothing for this OA" — stored so we don't re-query an OA that has no data for this dataset.
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    dataset: { type: String, required: true }, // Nomis dataset id, e.g. NM_2020_1
    oa: { type: String, required: true },       // OA21CD
    counts: { type: mongoose.Schema.Types.Mixed, default: {} }, // { label: count }
    fetchedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// One row per (dataset, OA); the compound unique index is also the lookup index for the $in query.
schema.index({ dataset: 1, oa: 1 }, { unique: true });

module.exports = mongoose.models.InsightsOaData || mongoose.model('InsightsOaData', schema);
