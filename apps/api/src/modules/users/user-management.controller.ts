import { Request, Response, Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { UserModel } from '../auth/models/user.model';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';
import { asyncHandler } from '@api/middlewares/async.handler';
import { sendEmail } from '@api/lib/email.service';
import logger from '@api/utils/logger';
import { AppRole } from '@api/types/express';

const router = Router();

// Role hierarchy for validation
const ROLE_HIERARCHY: Record<AppRole, number> = {
  'READ_ONLY': 1,
  'ASSISTANT': 2,
  'NURSE': 3,
  'DOCTOR': 4,
  'CLINIC_ADMIN': 5,
  'SUPER_ADMIN': 6,
};

// Roles that CLINIC_ADMIN can create
const CLINIC_ADMIN_CREATABLE_ROLES: AppRole[] = ['DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'];

// Generate temporary password
function generateTemporaryPassword(): string {
  return crypto.randomBytes(12).toString('base64').slice(0, 16);
}

// Validation schemas
const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email address'),
  role: z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY']),
  clinicId: z.string().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY']).optional(),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  clinicId: z.string().optional(),
});

// POST /users — Create User
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: createUserSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { fullName, email, role, clinicId } = req.body;
    const requestingUser = req.user!;

    // CLINIC_ADMIN can only create specific roles
    if (requestingUser.role === 'CLINIC_ADMIN' && !CLINIC_ADMIN_CREATABLE_ROLES.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `CLINIC_ADMIN cannot create ${role} accounts. Allowed roles: ${CLINIC_ADMIN_CREATABLE_ROLES.join(', ')}`,
      });
    }

    // CLINIC_ADMIN can only create users in their own clinic
    const targetClinicId = clinicId || requestingUser.clinicId;
    if (requestingUser.role === 'CLINIC_ADMIN' && targetClinicId !== requestingUser.clinicId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'CLINIC_ADMIN can only create users in their own clinic',
      });
    }

    // Check if email already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email already exists',
      });
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Create user
    const user = await UserModel.create({
      fullName,
      email: email.toLowerCase(),
      password: temporaryPassword,
      role,
      clinicId: targetClinicId,
      isActive: true,
      emailVerified: false,
      mustChangePassword: true, // Force password change on first login
    });

    // Send welcome email with temporary password
    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to Health Watchers - Account Created',
        text: `Hello ${fullName},\n\nYour Health Watchers account has been created.\n\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nPlease log in and change your password immediately.\n\nBest regards,\nHealth Watchers Team`,
        html: `
          <h2>Welcome to Health Watchers</h2>
          <p>Hello ${fullName},</p>
          <p>Your Health Watchers account has been created.</p>
          <p><strong>Email:</strong> ${email}<br>
          <strong>Temporary Password:</strong> ${temporaryPassword}</p>
          <p><strong>Important:</strong> Please log in and change your password immediately.</p>
          <p>Best regards,<br>Health Watchers Team</p>
        `,
      });
      logger.info({ userId: user._id, email, createdBy: requestingUser.userId }, 'User created and welcome email sent');
    } catch (emailError) {
      logger.error({ error: emailError, userId: user._id }, 'Failed to send welcome email');
      // Don't fail the request if email fails
    }

    return res.status(201).json({
      status: 'success',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  }),
);

// GET /users — List Users
router.get(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ query: listUsersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, role, isActive, clinicId } = req.query as any;
    const requestingUser = req.user!;

    const filter: Record<string, any> = {};

    // CLINIC_ADMIN can only list users in their clinic
    if (requestingUser.role === 'CLINIC_ADMIN') {
      filter.clinicId = requestingUser.clinicId;
    } else if (clinicId) {
      // SUPER_ADMIN can filter by clinicId
      filter.clinicId = clinicId;
    }

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select('-password -mfaSecret -resetPasswordTokenHash -emailVerificationTokenHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: users.map((user) => ({
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }),
);

// GET /users/:id — Get User
router.get(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const requestingUser = req.user!;

    const user = await UserModel.findById(id).select(
      '-password -mfaSecret -resetPasswordTokenHash -emailVerificationTokenHash'
    );

    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    // CLINIC_ADMIN can only view users in their clinic
    if (requestingUser.role === 'CLINIC_ADMIN' && user.clinicId.toString() !== requestingUser.clinicId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view users in your clinic',
      });
    }

    return res.json({
      status: 'success',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }),
);

// PUT /users/:id — Update User
router.put(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: updateUserSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fullName, role } = req.body;
    const requestingUser = req.user!;

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    // CLINIC_ADMIN can only update users in their clinic
    if (requestingUser.role === 'CLINIC_ADMIN' && user.clinicId.toString() !== requestingUser.clinicId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update users in your clinic',
      });
    }

    // Role escalation restrictions
    if (role) {
      // CLINIC_ADMIN cannot escalate to SUPER_ADMIN or CLINIC_ADMIN
      if (requestingUser.role === 'CLINIC_ADMIN' && !CLINIC_ADMIN_CREATABLE_ROLES.includes(role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `CLINIC_ADMIN cannot assign ${role} role`,
        });
      }

      // Cannot escalate a user to a role higher than your own
      if (ROLE_HIERARCHY[role] > ROLE_HIERARCHY[requestingUser.role]) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot assign a role higher than your own',
        });
      }

      // Cannot modify SUPER_ADMIN accounts unless you are SUPER_ADMIN
      if (user.role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only SUPER_ADMIN can modify SUPER_ADMIN accounts',
        });
      }

      user.role = role;
    }

    if (fullName) user.fullName = fullName;

    await user.save();

    logger.info({ userId: id, updatedBy: requestingUser.userId, changes: req.body }, 'User updated');

    return res.json({
      status: 'success',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        isActive: user.isActive,
        updatedAt: user.updatedAt,
      },
    });
  }),
);

// DELETE /users/:id — Deactivate User (Soft Delete)
router.delete(
  '/:id',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const requestingUser = req.user!;

    // Cannot deactivate yourself
    if (id === requestingUser.userId) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'You cannot deactivate your own account',
      });
    }

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    // CLINIC_ADMIN can only deactivate users in their clinic
    if (requestingUser.role === 'CLINIC_ADMIN' && user.clinicId.toString() !== requestingUser.clinicId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only deactivate users in your clinic',
      });
    }

    // CLINIC_ADMIN cannot deactivate SUPER_ADMIN or other CLINIC_ADMIN
    if (requestingUser.role === 'CLINIC_ADMIN' && ['SUPER_ADMIN', 'CLINIC_ADMIN'].includes(user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `CLINIC_ADMIN cannot deactivate ${user.role} accounts`,
      });
    }

    // Deactivate user
    user.isActive = false;
    await user.save();

    // Invalidate all active tokens for the user
    await RefreshTokenModel.deleteMany({ userId: id });

    logger.info({ userId: id, deactivatedBy: requestingUser.userId }, 'User deactivated and tokens invalidated');

    return res.json({
      status: 'success',
      message: 'User deactivated successfully',
      data: {
        id: user._id,
        isActive: user.isActive,
      },
    });
  }),
);

// POST /users/:id/reset-password — Admin Password Reset
router.post(
  '/:id/reset-password',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const requestingUser = req.user!;

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    // CLINIC_ADMIN can only reset passwords for users in their clinic
    if (requestingUser.role === 'CLINIC_ADMIN' && user.clinicId.toString() !== requestingUser.clinicId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only reset passwords for users in your clinic',
      });
    }

    // CLINIC_ADMIN cannot reset SUPER_ADMIN or CLINIC_ADMIN passwords
    if (requestingUser.role === 'CLINIC_ADMIN' && ['SUPER_ADMIN', 'CLINIC_ADMIN'].includes(user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `CLINIC_ADMIN cannot reset ${user.role} passwords`,
      });
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Update user password and force change on next login
    user.password = temporaryPassword;
    (user as any).mustChangePassword = true;
    await user.save();

    // Send password reset email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Health Watchers - Password Reset by Administrator',
        text: `Hello ${user.fullName},\n\nYour password has been reset by an administrator.\n\nTemporary Password: ${temporaryPassword}\n\nPlease log in and change your password immediately.\n\nBest regards,\nHealth Watchers Team`,
        html: `
          <h2>Password Reset</h2>
          <p>Hello ${user.fullName},</p>
          <p>Your password has been reset by an administrator.</p>
          <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
          <p><strong>Important:</strong> Please log in and change your password immediately.</p>
          <p>Best regards,<br>Health Watchers Team</p>
        `,
      });
      logger.info({ userId: id, resetBy: requestingUser.userId }, 'Admin password reset completed');
    } catch (emailError) {
      logger.error({ error: emailError, userId: id }, 'Failed to send password reset email');
      // Don't fail the request if email fails
    }

    return res.json({
      status: 'success',
      message: 'Password reset successfully. User will be required to change password on next login.',
    });
  }),
);

export const userManagementRoutes = router;
