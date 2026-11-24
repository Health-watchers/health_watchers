import { Router } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { paymentLimiter } from '@api/middlewares/rate-limit.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { submitDexTrade, getTradeHistory } from './dex-trade.controller';

/**
 * DEX trade routes — Issue #1427
 *
 * Mounted at: /api/v1/payments/dex
 * Access:     CLINIC_ADMIN for submitting trades; CLINIC_ADMIN or DOCTOR for history
 *
 * Routes:
 *   POST /trade      Submit a new Stellar DEX trade offer
 *   GET  /history    Retrieve DEX trade history for the clinic
 */
const router = Router();

// All DEX endpoints require a valid JWT.
router.use(authenticate);

/**
 * @openapi
 * /payments/dex/trade:
 *   post:
 *     tags:
 *       - Payments - DEX
 *     summary: Submit a Stellar DEX trade
 *     description: >
 *       Creates a new Stellar DEX offer to exchange one asset for another.
 *       The trade is validated for slippage before being forwarded to the
 *       Stellar network. Only CLINIC_ADMIN users may initiate trades.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sellAsset
 *               - buyAsset
 *               - sellAmount
 *               - expectedPrice
 *             properties:
 *               sellAsset:
 *                 type: string
 *                 description: Asset code to sell (e.g. "XLM")
 *               buyAsset:
 *                 type: string
 *                 description: Asset code to buy (e.g. "USDC")
 *               sellAmount:
 *                 type: number
 *                 description: Amount of sellAsset to trade
 *               expectedPrice:
 *                 type: number
 *                 description: Expected exchange rate (buyAsset per sellAsset)
 *               maxSlippagePercent:
 *                 type: number
 *                 default: 1
 *                 description: Maximum acceptable slippage as a percentage (0–50)
 *     responses:
 *       202:
 *         description: Trade accepted and submitted to Stellar network
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Trade submitted
 *                 data:
 *                   type: object
 *                   properties:
 *                     sellAsset:
 *                       type: string
 *                     buyAsset:
 *                       type: string
 *                     sellAmount:
 *                       type: number
 *                     expectedPrice:
 *                       type: number
 *                     minAcceptablePrice:
 *                       type: number
 *                     maxSlippagePercent:
 *                       type: number
 *       400:
 *         description: Invalid trade parameters (missing fields, slippage exceeded, etc.)
 *       401:
 *         description: Missing or invalid JWT
 *       403:
 *         description: Insufficient permissions (requires CLINIC_ADMIN role)
 *       429:
 *         description: Payment rate limit exceeded
 */
router.post('/trade', paymentLimiter, requireRoles('CLINIC_ADMIN'), asyncHandler(submitDexTrade));

/**
 * @openapi
 * /payments/dex/history:
 *   get:
 *     tags:
 *       - Payments - DEX
 *     summary: Get DEX trade history for the clinic
 *     description: >
 *       Returns the list of DEX trades submitted by the clinic.
 *       Accessible by CLINIC_ADMIN and DOCTOR roles.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trade history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Missing or invalid JWT
 *       403:
 *         description: Insufficient permissions (requires CLINIC_ADMIN or DOCTOR role)
 */
router.get('/history', requireRoles('CLINIC_ADMIN', 'DOCTOR'), asyncHandler(getTradeHistory));

export default router;
