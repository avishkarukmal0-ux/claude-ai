'use strict';

// English Indices of Deprivation 2025 (IoD2025), per LSOA (2021). OGL v3.0; published 30 Oct 2025.
// Imported ONCE from the official CSV via scripts/import-imd.js (never fetched at request time — it's a static
// 33,755-row England dataset). Joined to postcodes.io `lsoa21`. England only; Welsh LSOAs (W…) aren't covered.
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    lsoa21: { type: String, required: true, unique: true, index: true }, // "LSOA code (2021)"
    score: { type: Number, default: null },     // IMD score
    rank: { type: Number, default: null },      // 1 = most deprived
    rankOf: { type: Number, default: null },    // total ranked LSOAs (e.g. 33755)
    decile: { type: Number, default: null },    // 1 = most deprived 10%
    source: { type: String, default: 'English indices of deprivation 2025' },
    referenceDate: { type: String, default: 'IMD 2025 (30 Oct 2025)' },
  },
  { versionKey: false, timestamps: true },
);

module.exports = mongoose.models.ImdArea || mongoose.model('ImdArea', schema);
