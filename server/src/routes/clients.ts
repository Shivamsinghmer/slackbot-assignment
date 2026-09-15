import { Router } from 'express';
import { z } from 'zod';
import { Client } from '../models/Client.js';

export const clientsRouter = Router();

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

const updateSchema = z.object({
  slack_webhook_url: z
    .string()
    .trim()
    .refine((v) => v === '' || SLACK_WEBHOOK_PATTERN.test(v), {
      message: 'Must be a https://hooks.slack.com/services/... URL',
    })
    .optional(),
  slack_notifications_enabled: z.boolean().optional(),
});

clientsRouter.get('/clients', async (_req, res, next) => {
  try {
    const clients = await Client.find().sort({ _id: 1 }).lean();
    res.json(clients);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.put('/clients/:id', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
      return;
    }

    const updated = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
