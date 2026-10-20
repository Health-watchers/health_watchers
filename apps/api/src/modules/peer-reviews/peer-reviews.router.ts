import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { isValidObjectId } from '@api/middlewares/common.middleware';
import { PeerReviewModel } from './peer-review.model';
import { EncounterModel } from '../encounters/encounter.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';

const router = Router();

const CATEGORY_KEYS = ['documentation', 'diagnosis', 'treatment', 'followUp'] as const;

// POST /peer-reviews — CLINIC_ADMIN assigns an encounter for peer review
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { encounterId, reviewerId, isAnonymous = false } = req.body;
    const clinicId = req.user!.clinicId;

    if (!encounterId || !reviewerId) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'encounterId and reviewerId are required' });
    }

    if (!isValidObjectId(encounterId) || !isValidObjectId(reviewerId)) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'Invalid encounterId or reviewerId' });
    }

    const encounter = await EncounterModel.findOne({
      _id: encounterId,
      clinicId,
    }).lean();

    if (!encounter) {
      return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
    }

    const revieweeId = String(encounter.attendingDoctorId);

    if (revieweeId === reviewerId) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Reviewer and reviewee cannot be the same person' });
    }

    // Verify reviewer belongs to the same clinic
    const reviewer = await UserModel.findOne({ _id: reviewerId, clinicId, isActive: true }).lean();
    if (!reviewer) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'Reviewer not found in this clinic' });
    }

    const existing = await PeerReviewModel.findOne({ encounterId }).lean();
    if (existing) {
      return res
        .status(409)
        .json({ error: 'Conflict', message: 'This encounter already has a peer review assigned' });
    }

    const review = await PeerReviewModel.create({
      encounterId,
      reviewerId,
      revieweeId,
      clinicId,
      isAnonymous,
      status: 'pending',
    });

    return res.status(201).json({ status: 'success', data: review });
  }
);

// GET /peer-reviews/assigned — reviews assigned to the current user (DOCTOR)
router.get(
  '/assigned',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { status } = req.query as { status?: string };
    const ALLOWED_STATUSES = new Set(['pending', 'completed', 'cancelled']);
    const filter: Record<string, unknown> = {
      reviewerId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      // Never surface a clinician's own encounter as something they can review
      revieweeId: { $ne: new Types.ObjectId(req.user!.userId) },
    };
    if (status) {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid status value' });
      }
      filter.status = status;
    }

    const reviews = await PeerReviewModel.find(filter)
      .populate('encounterId', 'chiefComplaint patientId createdAt status')
      .populate('revieweeId', 'fullName role')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ status: 'success', data: reviews });
  }
);

// GET /peer-reviews/received — completed reviews of the current clinician's encounters
router.get(
  '/received',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const reviews = await PeerReviewModel.find({
      revieweeId: new Types.ObjectId(req.user!.userId),
      clinicId: new Types.ObjectId(req.user!.clinicId),
      status: 'completed',
    })
      .populate('encounterId', 'chiefComplaint patientId createdAt status')
      .populate('reviewerId', 'fullName role')
      .sort({ completedAt: -1 })
      .lean();

    // Strip reviewer identity from anonymous reviews before it leaves the server
    const data = reviews.map((r: any) => (r.isAnonymous ? { ...r, reviewerId: null } : r));

    return res.json({ status: 'success', data });
  }
);

// PUT /peer-reviews/:id — submit a review (reviewer only)
router.put(
  '/:id',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { rating, feedback, categories, requiresFollowUp } = req.body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'rating must be between 1 and 5' });
    }

    if (categories !== undefined) {
      const invalid = CATEGORY_KEYS.some((k) => {
        const v = categories?.[k];
        return v !== undefined && (!Number.isInteger(v) || v < 1 || v > 5);
      });
      if (invalid || typeof categories !== 'object' || categories === null) {
        return res
          .status(400)
          .json({ error: 'BadRequest', message: 'category scores must be between 1 and 5' });
      }
    }

    const review = await PeerReviewModel.findOne({
      _id: req.params.id,
      reviewerId: req.user!.userId,
      clinicId: req.user!.clinicId,
    });

    if (!review) {
      return res.status(404).json({ error: 'NotFound', message: 'Review not found' });
    }

    if (review.status === 'completed') {
      return res.status(409).json({ error: 'Conflict', message: 'Review already completed' });
    }

    // A clinician may never score their own encounter — check both the stored reviewee and
    // the encounter's current attending doctor in case the encounter was reassigned.
    const encounter = await EncounterModel.findById(review.encounterId, {
      attendingDoctorId: 1,
    }).lean();
    if (
      String(review.revieweeId) === req.user!.userId ||
      (encounter && String(encounter.attendingDoctorId) === req.user!.userId)
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You cannot review your own encounter',
      });
    }

    review.rating = rating;
    review.feedback = typeof feedback === 'string' ? feedback.slice(0, 5000) : undefined;
    review.categories = categories;
    review.requiresFollowUp = Boolean(requiresFollowUp);
    review.status = 'completed';
    review.completedAt = new Date();
    await review.save();

    // Notify reviewee (hide reviewer identity if anonymous)
    const reviewerName = review.isAnonymous
      ? 'An anonymous reviewer'
      : ((await UserModel.findById(review.reviewerId).lean())?.fullName ?? 'A reviewer');

    await createNotification({
      userId: review.revieweeId,
      clinicId: review.clinicId,
      type: 'system',
      title: 'Peer Review Completed',
      message: `${reviewerName} has completed a peer review of your encounter. Score: ${rating}/5.`,
      link: `/encounters`,
      metadata: { peerReviewId: String(review._id), rating },
    });

    return res.json({ status: 'success', data: review });
  }
);

// GET /peer-reviews/stats — quality metrics per doctor for the clinic (CLINIC_ADMIN)
router.get(
  '/stats',
  authenticate,
  requireRoles('CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const clinicId = new Types.ObjectId(req.user!.clinicId);

    const stats = await PeerReviewModel.aggregate([
      { $match: { clinicId, status: 'completed' } },
      {
        $group: {
          _id: '$revieweeId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          avgDocumentation: { $avg: '$categories.documentation' },
          avgDiagnosis: { $avg: '$categories.diagnosis' },
          avgTreatment: { $avg: '$categories.treatment' },
          avgFollowUp: { $avg: '$categories.followUp' },
          followUpCount: { $sum: { $cond: ['$requiresFollowUp', 1, 0] } },
          lastReviewedAt: { $max: '$completedAt' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'doctor',
          pipeline: [{ $project: { fullName: 1, role: 1 } }],
        },
      },
      { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
      { $sort: { averageRating: -1 } },
    ]);

    return res.json({ status: 'success', data: stats });
  }
);

export default router;
