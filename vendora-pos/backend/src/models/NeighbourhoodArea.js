'use strict';

// Server-side cache of real neighbourhood figures for a store's area. Keyed by the normalised postcode (the
// store's business address — no personal data). Holds the postcodes.io area codes and one or more official
// figures, each carrying FULL PROVENANCE (source, dataset id, edition/version, the data's reference date, the
// dataset's last_updated, and when we fetched it) so the PWA can show exactly how fresh each number is.
//
// We never store invented numbers: a figure only lands here after a successful upstream fetch. A hard TTL
// index caps how long a record survives; application code additionally re-fetches on staleness / a newer
// dataset last_updated (see neighbourhoodService).
const mongoose = require('mongoose');

const figureSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },        // e.g. 'population'
    label: { type: String, default: null },
    value: { type: Number, required: true },
    unit: { type: String, default: null },
    geography: { type: String, default: null },   // the geography the figure is for, e.g. 'lsoa21'
    geographyCode: { type: String, default: null },
    source: { type: String, required: true },     // 'ONS' | 'Nomis'
    datasetId: { type: String, default: null },
    edition: { type: String, default: null },
    version: { type: String, default: null },
    referenceDate: { type: String, default: null }, // what period the data describes, e.g. 'Census 2021'
    lastUpdated: { type: String, default: null },    // the dataset's own last_updated
    fetchedAt: { type: Date, default: Date.now },
    attribution: { type: String, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    postcode: { type: String, required: true, unique: true, index: true }, // normalised (upper, no spaces)
    lsoa21: { type: String, default: null },
    msoa21: { type: String, default: null },
    ward: { type: String, default: null },
    district: { type: String, default: null },
    country: { type: String, default: null },
    figures: { type: [figureSchema], default: [] },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Hard cap so the cache can't grow unbounded; refresh logic lives in the service (TTL in hours + dataset
// last_updated). 180 days is well beyond the normal refresh window.
schema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.models.NeighbourhoodArea || mongoose.model('NeighbourhoodArea', schema);
