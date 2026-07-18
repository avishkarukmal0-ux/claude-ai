'use strict';

const express = require('express');
const router = express.Router();
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

// In-memory map of active queue-bust sessions
// Key: tillId, Value: { tillId, staffId, staffName, startedAt }
const activeSessions = new Map();

// POST /api/pos/queue-bust/start — authenticated
router.post('/start', async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const tillId = 'MOBILE-' + userId.slice(-4);
    const staffName = req.user.displayName || req.user.email || 'Staff';

    const session = {
      tillId,
      staffId: req.user._id,
      staffName,
      startedAt: new Date(),
    };

    activeSessions.set(tillId, session);

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('queuebust:started', {
        tillId,
        staffName,
      });
    }

    res.json({ success: true, tillId, staffId: req.user._id });
  } catch (err) {
    next(err);
  }
});

// POST /api/pos/queue-bust/end — authenticated
router.post('/end', async (req, res, next) => {
  try {
    const { tillId } = req.body;
    if (tillId) {
      activeSessions.delete(tillId);
      if (req.io) {
        req.io.to(`store:${req.storeId}`).emit('queuebust:ended', { tillId });
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/pos/queue-bust/active — requireRole supervisor
router.get('/active', requireRole('supervisor'), async (req, res, next) => {
  try {
    const sessions = Array.from(activeSessions.values());
    res.json({ success: true, sessions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
