import { authJson } from './authJson';

export type PeerReviewCategoryKey = 'documentation' | 'diagnosis' | 'treatment' | 'followUp';

export interface PeerReviewUserRef {
  _id: string;
  fullName: string;
  role: string;
}

export interface PeerReview {
  _id: string;
  encounterId: {
    _id: string;
    chiefComplaint?: string;
    patientId?: string;
    createdAt?: string;
    status?: string;
  } | null;
  reviewerId?: PeerReviewUserRef | string | null;
  revieweeId?: PeerReviewUserRef | string | null;
  status: 'pending' | 'in_review' | 'completed';
  rating?: number;
  feedback?: string;
  recommendations?: string;
  requestNote?: string;
  categories?: Partial<Record<PeerReviewCategoryKey, number>>;
  requiresFollowUp?: boolean;
  isAnonymous: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface PeerReviewer {
  id: string;
  fullName: string;
  role: string;
}

export interface PeerReviewTheme {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface PeerReviewAnalytics {
  totalReviews: number;
  pendingCount: number;
  averageRating: number | null;
  categoryAverages: Record<PeerReviewCategoryKey, number | null>;
  followUpCount: number;
  ratingDistribution: { rating: number; count: number }[];
  monthlyTrend: { month: string; averageRating: number; count: number }[];
  commonThemes: PeerReviewTheme[];
}

export interface PeerReviewRequest {
  encounterId: string;
  reviewerId: string;
  isAnonymous?: boolean;
  requestNote?: string;
}

export const peerReviewKeys = {
  all: ['peer-reviews'] as const,
  assigned: ['peer-reviews', 'assigned'] as const,
  received: ['peer-reviews', 'received'] as const,
  stats: ['peer-reviews', 'stats'] as const,
  analytics: ['peer-reviews', 'analytics'] as const,
  reviewers: (excludeUserId?: string) => ['peer-reviews', 'reviewers', excludeUserId] as const,
  encounter: (encounterId: string) => ['peer-reviews', 'encounter', encounterId] as const,
};

export const peerReviewsApi = {
  assigned: (status?: 'pending' | 'completed') =>
    authJson<PeerReview[]>(`/peer-reviews/assigned${status ? `?status=${status}` : ''}`),
  received: () => authJson<PeerReview[]>('/peer-reviews/received'),
  analytics: () => authJson<PeerReviewAnalytics>('/peer-reviews/analytics'),
  reviewers: (excludeUserId?: string) =>
    authJson<PeerReviewer[]>(
      `/peer-reviews/reviewers${excludeUserId ? `?excludeUserId=${encodeURIComponent(excludeUserId)}` : ''}`
    ),
  forEncounter: (encounterId: string) =>
    authJson<PeerReview | null>(`/peer-reviews/encounter/${encodeURIComponent(encounterId)}`),
  request: (body: PeerReviewRequest) =>
    authJson<PeerReview>('/peer-reviews', { method: 'POST', body: JSON.stringify(body) }),
};
