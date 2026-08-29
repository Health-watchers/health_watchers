import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import { validateRequest } from '../../middlewares/validate.middleware';
import { asyncHandler, sendError, sendSuccess } from '@health-watchers/utils';
import { LoginDto, RefreshDto, loginSchema, refreshSchema } from './auth.validation';
import { UserModel } from './models/user.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service';

const router = Router();
type LoginReq   = Request<Record<string, never>, unknown, LoginDto>;
type RefreshReq = Request<Record<string, never>, unknown, RefreshDto>;
const INVALID = 'Invalid email or password';

router.post('/login', validateRequest({ body: loginSchema }), asyncHandler(async (req: LoginReq, res: Response) => {
  const user = await UserModel.findOne({ email: req.body.email.toLowerCase().trim() });
  if (!user || !user.isActive) return sendError(res, 401, 'Unauthorized', INVALID);
  if (!await bcrypt.compare(req.body.password, user.password))
    return sendError(res, 401, 'Unauthorized', INVALID);
  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  return sendSuccess(res, { accessToken: signAccessToken(p), refreshToken: signRefreshToken(p) });
}));

router.post('/refresh', validateRequest({ body: refreshSchema }), asyncHandler(async (req: RefreshReq, res: Response) => {
  const decoded = verifyRefreshToken(req.body.refreshToken);
  if (!decoded) return sendError(res, 401, 'Unauthorized', 'Invalid refresh token');
  const user = await UserModel.findById(decoded.userId);
  if (!user || !user.isActive) return sendError(res, 401, 'Unauthorized', 'Invalid refresh token');
  return sendSuccess(res, { accessToken: signAccessToken({ userId: user.id, role: user.role, clinicId: String(user.clinicId) }) });
}));

export const authRoutes = router;
