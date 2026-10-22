import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { isValidObjectId } from '@api/middlewares/common.middleware';
import { PeerReviewModel } from './peer-review.model';
import { EncounterModel } from '../encounters/encounter.model';
import { UserModel } from '../auth/models/user.model';
import { createNotification } from '../notifications/notification.service';
import { summariseThemes } from './peer-review-themes';

const router = Router();

const CATEGORY_KEYS = ['documentation', 'diagnosis', 'treatment', 'followUp'] as const;

const REVIEWER_ROLES = ['DOCTOR', 'CLINIC_ADMIN'];

// GET /peer-reviews/reviewers — clinicians in the clinic who can be asked to review
router.get(
  '/reviewers',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { excludeUserId } = req.query as { excludeUserId?: string };
    const exclude = [req.user!.userId];
    if (excludeUserId && isValidObjectId(excludeUserId)) exclude.push(excludeUserId);

    const users = await UserModel.find(
      {
        clinicId: req.user!.clinicId,
        isActive: true,
        role: { $in: REVIEWER_ROLES },
        _id: { $nin: exclude },
      },
      { fullName: 1, role: 1 }
    )
      .sort({ fullName: 1 })
      .lean();

    return res.json({
      status: 'success',
      data: users.map((u: any) => ({ id: String(u._id), fullName: u.fullName, role: u.role })),
    });
  }
);

// GET /peer-reviews/encounter/:encounterId — review attached to an encounter, if any
router.get(
  '/encounter/:encounterId',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { encounterId } = req.params;
    if (!isValidObjectId(encounterId)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid encounterId' });
    }

    const review: any = await PeerReviewModel.findOne({
      encounterId,
      clinicId: req.user!.clinicId,
    })
      .populate('reviewerId', 'fullName role')
      .populate('revieweeId', 'fullName role')
      .lean();

    if (!review) return res.json({ status: 'success', data: null });

    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'CLINIC_ADMIN';
    const reviewerId = String(review.reviewerId?._id ?? review.reviewerId);
    const revieweeId = String(review.revieweeId?._id ?? review.revieweeId);
    if (!isAdmin && userId !== reviewerId && userId !== revieweeId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not a participant in this review' });
    }

    // The reviewee must never learn who reviewed them anonymously
    const data =
      review.isAnonymous && !isAdmin && userId !== reviewerId
        ? { ...review, reviewerId: null }
        : review;
    return res.json({ status: 'success', data });
  }
);

// POST /peer-reviews — request a peer review of an encounter.
// CLINIC_ADMIN can assign any encounter in the clinic; a DOCTOR can request review of an
// encounter they authored.
router.post(
  '/',
  authenticate,
  requireRoles('CLINIC_ADMIN', 'DOCTOR'),
  async (req: Request, res: Response) => {
    const { encounterId, reviewerId, isAnonymous = false, requestNote } = req.body;
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

    if (req.user!.role === 'DOCTOR' && revieweeId !== req.user!.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Doctors can only request peer review of their own encounters',
      });
    }

    if (revieweeId === reviewerId) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Reviewer and reviewee cannot be the same person' });
    }

    // Verify reviewer belongs to the same clinic
    const reviewer = await UserModel.findOne({
      _id: reviewerId,
      clinicId,
      isActive: true,
      role: { $in: REVIEWER_ROLES },
    }).lean();
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
      isAnonymous: Boolean(isAnonymous),
      requestedBy: req.user!.userId,
      requestNote: typeof requestNote === 'string' ? requestNote.slice(0, 1000) : undefined,
      status: 'pending',
    });

    await createNotification({
      userId: review.reviewerId,
      clinicId: review.clinicId,
      type: 'system',
      title: 'Peer Review Requested',
      message: `You have been asked to peer review an encounter: ${
        (encounter as any).chiefComplaint ?? 'encounter'
      }.`,
      link: `/peer-reviews`,
      metadata: { peerReviewId: String(review._id), encounterId: String(encounterId) },
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
    const { rating, feedback, recommendations, categories, requiresFollowUp } = req.body;

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
    review.recommendations =
      typeof recommendations === 'string' ? recommendations.slice(0, 5000) : undefined;
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
      message: `${reviewerName} has completed a peer review of your encounter. Score: ${rating}/5.${
        review.recommendations ? ' Recommendations are included.' : ''
      }`,
      link: `/encounters/${String(review.encounterId)}`,
      metadata: {
        peerReviewId: String(review._id),
        encounterId: String(review.encounterId),
        rating,
        requiresFollowUp: review.requiresFollowUp,
      },
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

// GET /peer-reviews/analytics — clinic-wide peer review analytics (CLINIC_ADMIN).
// Doctors get the same view scoped to reviews of their own encounters.
router.get(
  '/analytics',
  authenticate,
  requireRoles('DOCTOR', 'CLINIC_ADMIN'),
  async (req: Request, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const match: Record<string, unknown> = {
      clinicId: new Types.ObjectId(req.user!.clinicId),
      status: 'completed',
    };
    if (req.user!.role !== 'CLINIC_ADMIN') {
      match.revieweeId = new Types.ObjectId(req.user!.userId);
    }
    const range: Record<string, Date> = {};
    for (const [key, value] of [
      ['$gte', from],
      ['$lte', to],
    ] as const) {
      if (!value) continue;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'ValidationError', message: 'Invalid date range' });
      }
      range[key] = d;
    }
    if (Object.keys(range).length) match.completedAt = range;

    const [summary] = await PeerReviewModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          avgDocumentation: { $avg: '$categories.documentation' },
          avgDiagnosis: { $avg: '$categories.diagnosis' },
          avgTreatment: { $avg: '$categories.treatment' },
          avgFollowUp: { $avg: '$categories.followUp' },
          followUpCount: { $sum: { $cond: ['$requiresFollowUp', 1, 0] } },
        },
      },
    ]);

    const distribution = await PeerReviewModel.aggregate([
      { $match: match },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const monthly = await PeerReviewModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$completedAt' } },
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const pendingMatch: Record<string, unknown> = {
      clinicId: match.clinicId,
      status: { $in: ['pending', 'in_review'] },
    };
    if (match.revieweeId) pendingMatch.revieweeId = match.revieweeId;
    const pendingCount = await PeerReviewModel.countDocuments(pendingMatch);

    const texts = await PeerReviewModel.find(match, { feedback: 1, recommendations: 1 })
      .sort({ completedAt: -1 })
      .limit(500)
      .lean();

    return res.json({
      status: 'success',
      data: {
        totalReviews: summary?.totalReviews ?? 0,
        pendingCount,
        averageRating: summary?.averageRating ?? null,
        categoryAverages: {
          documentation: summary?.avgDocumentation ?? null,
          diagnosis: summary?.avgDiagnosis ?? null,
          treatment: summary?.avgTreatment ?? null,
          followUp: summary?.avgFollowUp ?? null,
        },
        followUpCount: summary?.followUpCount ?? 0,
        ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
          rating,
          count: distribution.find((d: any) => d._id === rating)?.count ?? 0,
        })),
        monthlyTrend: monthly.map((m: any) => ({
          month: m._id,
          averageRating: m.averageRating,
          count: m.count,
        })),
        commonThemes: summariseThemes(texts as any[]),
      },
    });
  }
);

export default router;
