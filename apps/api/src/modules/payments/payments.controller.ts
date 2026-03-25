import { Request, Response, Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { PaymentRecordModel } from './models/payment-record.model';
import { config } from '@health-watchers/config';
import crypto from 'crypto';

const router = Router();

/**
 * @swagger
 * /payments/intent:
 *   post:
 *     summary: Create a Stellar payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: string
 *                 description: Payment amount in XLM
 *                 example: "10.00"
 *     responses:
 *       200:
 *         description: Payment intent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     intentId:    { type: string, format: uuid }
 *                     clinicId:    { type: string }
 *                     amount:      { type: string }
 *                     destination: { type: string, description: Stellar public key }
 *                     memo:        { type: string }
 *                     network:     { type: string, enum: [testnet, mainnet] }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/intent', authenticate, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const clinicId = req.user?.clinicId!;
    const intentId = crypto.randomUUID();

    const intent = {
      intentId,
      clinicId,
      amount,
      destination: config.stellar.platformPublicKey,
      memo: `hw-${intentId.slice(0, 8)}`,
      network: config.stellar.network,
    };

    await PaymentRecordModel.create({ ...intent, status: 'pending' });
    return res.json({ status: 'success', data: intent });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /payments/status/{intentId}:
 *   get:
 *     summary: Get the status of a payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Payment intent UUID
 *     responses:
 *       200:
 *         description: Payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     intentId:      { type: string }
 *                     paymentStatus: { type: string, enum: [pending, confirmed, failed] }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Payment intent not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/status/:intentId', authenticate, async (req: Request, res: Response) => {
  const record = await PaymentRecordModel.findOne({
    intentId: req.params.intentId,
    clinicId: req.user?.clinicId,
  }).lean();

  if (!record) return res.status(404).json({ error: 'NotFound', message: 'Payment intent not found' });
  return res.json({ status: 'success', data: { intentId: record.intentId, paymentStatus: record.status } });
});

export const paymentRoutes = router;
