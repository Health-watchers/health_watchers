import { Router, Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /ai/summarize:
 *   post:
 *     summary: Generate an AI clinical summary for an encounter
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounterId]
 *             properties:
 *               encounterId:
 *                 type: string
 *                 description: Encounter ObjectId to summarize
 *     responses:
 *       501:
 *         description: Not yet implemented
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/summarize", (_req: Request, res: Response) => {
  res.status(501).json({ message: "ai summarize – not yet implemented" });
});

export default router;
