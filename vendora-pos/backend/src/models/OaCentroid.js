'use strict';

// ONS 2021 Output Area population-weighted centroids (England & Wales), used by the centroid-in-radius engine
// for Neighbourhood Insights. Loaded into MongoDB once (scripts/import-centroids.js) so it survives Render's
// ephemeral filesystem — same pattern as the IMD import. One row per Output Area. Open data (OGL v3.0).
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    oa: { type: String, required: true, unique: true, index: true }, // OA21CD
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    lsoa: { type: String, default: null }, // LSOA21CD — optional; enables the radius deprivation (IMD) average

  },
  { versionKey: false },
);

module.exports = mongoose.models.OaCentroid || mongoose.model('OaCentroid', schema);
