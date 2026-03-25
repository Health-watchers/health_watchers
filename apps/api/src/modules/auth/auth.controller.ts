import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { LoginDto, RefreshDto, loginSchema, refreshSchema } from './auth.validation';
import { UserModel } from './models/user.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service';

const router = Router();
type LoginReq   = Request<Record<string, never>, unknown, LoginDto>;
type RefreshReq = Request<Record<string, never>, unknown, RefreshDto>;
const INVALID = 'Invalid email or password';

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate a user and obtain JWT tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     refreshToken: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', validateRequest({ body: loginSchema }), async (req: LoginReq, res: Response) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase().trim() });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: INVALID });
  if (!await bcrypt.compare(req.body.password, user.password))
    return res.status(401).json({ error: 'Unauthorized', message: INVALID });
  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  return res.json({ status: 'success', data: { accessToken: signAccessToken(p), refreshToken: signRefreshToken(p) } });
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh an access token using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/refresh', validateRequest({ body: refreshSchema }), async (req: RefreshReq, res: Response) => {
  const decoded = verifyRefreshToken(req.body.refreshToken);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
  const user = await UserModel.findById(decoded.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
  return res.json({ status: 'success', data: { accessToken: signAccessToken({ userId: user.id, role: user.role, clinicId: String(user.clinicId) }) } });
});

export const authRoutes = router;
