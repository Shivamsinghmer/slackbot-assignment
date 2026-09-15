import { Router } from 'express';
import { NotificationLog } from '../models/NotificationLog.js';

export const logsRouter = Router();

/** Recent dispatch history — backs the dashboard's Notification Logs table. */
logsRouter.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter = req.query.client_id ? { client_id: String(req.query.client_id) } : {};

    const logs = await NotificationLog.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    res.json(logs);
  } catch (err) {
    next(err);
  }
});
