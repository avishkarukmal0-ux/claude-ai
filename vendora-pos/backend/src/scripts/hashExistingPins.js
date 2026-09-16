'use strict';
/**
 * One-time migration: hash any plaintext PINs/passwords still in the database.
 * Safe to run multiple times — skips already-hashed values (bcrypt prefix $2b$).
 *
 * Usage:
 *   cd vendora-pos/backend
 *   node src/scripts/hashExistingPins.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const Staff    = require('../models/Staff');

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vendora-dev');
  console.log('Connected to MongoDB');

  const staff = await Staff.find({}).lean();
  let hashed = 0;
  let alreadyHashed = 0;

  for (const s of staff) {
    let changed = false;
    const update = {};

    if (s.pin && !s.pin.startsWith('$2')) {
      update.pin = await bcrypt.hash(s.pin, ROUNDS);
      changed = true;
    }
    if (s.duressPin && !s.duressPin.startsWith('$2')) {
      update.duressPin = await bcrypt.hash(s.duressPin, ROUNDS);
      changed = true;
    }
    if (s.password && !s.password.startsWith('$2')) {
      update.password = await bcrypt.hash(s.password, ROUNDS);
      changed = true;
    }

    if (changed) {
      // Use updateOne to bypass pre-save hook (already hashing above)
      await Staff.updateOne({ _id: s._id }, { $set: update });
      console.log(`  ✓ Hashed credentials for: ${s.displayName} (${s.role})`);
      hashed++;
    } else {
      alreadyHashed++;
    }
  }

  console.log(`\nMigration complete: ${hashed} hashed, ${alreadyHashed} already hashed.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
