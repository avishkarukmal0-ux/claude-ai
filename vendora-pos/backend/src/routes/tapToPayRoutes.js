'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/AppError');

// In-memory session store (keyed by sessionId)
const sessions = new Map();

// Helper: clean up sessions older than 5 minutes
function cleanupSessions() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt && session.createdAt.getTime() < cutoff) {
      sessions.delete(id);
    }
  }
}

// POST /api/payments/tap-to-pay/initiate — authenticated
router.post('/initiate', async (req, res, next) => {
  try {
    cleanupSessions();

    const { amount, tillId } = req.body;
    if (amount === undefined || amount === null) {
      return next(AppError.validationError('amount is required'));
    }

    const sessionId = uuidv4();
    const session = {
      sessionId,
      amount: Number(amount),
      tillId: tillId || 'TILL-1',
      status: 'waiting',
      createdAt: new Date(),
    };

    sessions.set(sessionId, session);

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('tapToPay:waiting', {
        sessionId,
        amount: session.amount,
        tillId: session.tillId,
      });
    }

    res.json({ success: true, sessionId, amount: session.amount });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/tap-to-pay/complete — authenticated
router.post('/complete', async (req, res, next) => {
  try {
    cleanupSessions();

    const { sessionId, success, cardType, last4 } = req.body;
    if (!sessionId) return next(AppError.validationError('sessionId is required'));

    const session = sessions.get(sessionId);
    if (!session) {
      return res.json({ success: true, status: 'not_found' });
    }

    session.status = success ? 'completed' : 'failed';
    session.cardType = cardType || null;
    session.last4 = last4 || null;
    sessions.set(sessionId, session);

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('tapToPay:complete', {
        sessionId,
        success: !!success,
        cardType: cardType || null,
        last4: last4 || null,
        amount: session.amount,
      });
    }

    res.json({ success: true, status: session.status });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/tap-to-pay/status/:sessionId — authenticated
router.get('/status/:sessionId', async (req, res, next) => {
  try {
    cleanupSessions();

    const session = sessions.get(req.params.sessionId);
    if (!session) {
      return res.json({ success: true, status: 'not_found' });
    }

    res.json({ success: true, ...session });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
