'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  PageHeader,
  PageWrapper,
  SlideOver,
  Spinner,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@/components/ui';
import { SoapNotesView } from '@/components/encounters/SoapNotesView';
import { useAuth } from '@/context/AuthContext';
import { authJson } from '@/lib/authJson';

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoryKey = 'documentation' | 'diagnosis' | 'treatment' | 'followUp';

interface PeerReview {
  _id: string;
  encounterId: {
    _id: string;
    chiefComplaint?: string;
    patientId?: string;
    createdAt?: string;
    status?: string;
  } | null;
  reviewerId?: { _id: string; fullName: string; role: string } | string | null;
  revieweeId?: { _id: string; fullName: string; role: string } | string | null;
  status: 'pending' | 'in_review' | 'completed';
  rating?: number;
  feedback?: string;
  categories?: Partial<Record<CategoryKey, number>>;
  requiresFollowUp?: boolean;
  isAnonymous: boolean;
  completedAt?: string;
  createdAt: string;
}

interface ProviderStat {
  _id: string;
  doctor?: { fullName: string; role: string };
  averageRating: number | null;
  totalReviews: number;
  avgDocumentation: number | null;
  avgDiagnosis: number | null;
  avgTreatment: number | null;
  avgFollowUp: number | null;
  followUpCount: number;
  lastReviewedAt?: string;
}

interface Encounter {
  id: string;
  attendingDoctorId: string;
  chiefComplaint: string;
  status: string;
  createdAt: string;
  notes?: string;
  treatmentPlan?: string;
  soapNotes?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  diagnosis?: { code: string; description: string; isPrimary?: boolean }[];
  vitalSigns?: {
    bloodPressure?: string;
    heartRate?: number;
    temperature?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
  };
  prescriptions?: { drugName?: string; dosage?: string; frequency?: string }[];
  followUpDate?: string;
}

const RUBRIC: { key: CategoryKey; label: string; hint: string }[] = [
  {
    key: 'documentation',
    label: 'Documentation',
    hint: 'Complete, accurate, and timely SOAP notes',
  },
  { key: 'diagnosis', label: 'Diagnosis', hint: 'Assessment supported by history and findings' },
  {
    key: 'treatment',
    label: 'Treatment',
    hint: 'Plan appropriate to the diagnosis and guidelines',
  },
  {
    key: 'followUp',
    label: 'Follow-up',
    hint: 'Safety-netting, referrals, and follow-up arranged',
  },
];

const SCORE_LABELS = ['', 'Poor', 'Below standard', 'Meets standard', 'Good', 'Exemplary'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const idOf = (v: PeerReview['reviewerId']) =>
  v == null ? null : typeof v === 'string' ? v : v._id;
const nameOf = (v: PeerReview['reviewerId'], fallback: string) =>
  v && typeof v === 'object' ? v.fullName : fallback;
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
const fmtScore = (v?: number | null) => (v == null ? '—' : v.toFixed(1));

// ── Score input ───────────────────────────────────────────────────────────────

function ScoreInput({
  name,
  label,
  hint,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {label} <span className="text-danger-600">*</span>
      </legend>
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <span
              title={SCORE_LABELS[n]}
              className="peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-focus-visible:ring-primary-500 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 peer-checked:text-white peer-focus-visible:ring-2 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {n}
            </span>
          </label>
        ))}
        {value && (
          <span className="ml-2 self-center text-xs text-neutral-500 dark:text-neutral-400">
            {SCORE_LABELS[value]}
          </span>
        )}
      </div>
    </fieldset>
  );
}

// ── Read-only encounter ───────────────────────────────────────────────────────

function EncounterReadOnly({ encounterId }: { encounterId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: () => authJson<Encounter>(`/encounters/${encounterId}`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message={(error as Error)?.message ?? 'Encounter not found'} />;
  }

  const v = data.vitalSigns;
  const vitals = v
    ? [
        v.bloodPressure && `BP ${v.bloodPressure}`,
        v.heartRate && `HR ${v.heartRate}`,
        v.temperature && `Temp ${v.temperature}°`,
        v.respiratoryRate && `RR ${v.respiratoryRate}`,
        v.oxygenSaturation && `SpO₂ ${v.oxygenSaturation}%`,
        v.weight && `Wt ${v.weight} kg`,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Chief complaint
        </p>
        <p className="mt-1 text-neutral-900 dark:text-neutral-100">{data.chiefComplaint}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {fmtDate(data.createdAt)} · <span className="capitalize">{data.status}</span>
        </p>
      </div>

      {vitals.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Vitals</p>
          <p className="mt-1 text-neutral-800 dark:text-neutral-200">{vitals.join(' · ')}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          SOAP notes
        </p>
        <SoapNotesView soapNotes={data.soapNotes} />
      </div>

      {!!data.diagnosis?.length && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Diagnoses
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.diagnosis.map((d) => (
              <li key={d.code} className="text-neutral-800 dark:text-neutral-200">
                <span className="font-mono text-xs">{d.code}</span> {d.description}
                {d.isPrimary && (
                  <Badge variant="primary" className="ml-2">
                    Primary
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!data.prescriptions?.length && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Prescriptions
          </p>
          <ul className="mt-1 list-disc pl-5 text-neutral-800 dark:text-neutral-200">
            {data.prescriptions.map((p, i) => (
              <li key={i}>{[p.drugName, p.dosage, p.frequency].filter(Boolean).join(' · ')}</li>
            ))}
          </ul>
        </div>
      )}

      {data.treatmentPlan && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Treatment plan
          </p>
          <p className="mt-1 whitespace-pre-line text-neutral-800 dark:text-neutral-200">
            {data.treatmentPlan}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Submitted (immutable) review ──────────────────────────────────────────────

function SubmittedReview({ review, showReviewer }: { review: PeerReview; showReviewer?: boolean }) {
  return (
    <div className="space-y-4 text-sm" aria-readonly="true">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Submitted {fmtDate(review.completedAt)}</Badge>
        {review.requiresFollowUp && <Badge variant="warning">⚑ Requires follow-up</Badge>}
        {showReviewer && (
          <span className="text-xs text-neutral-500">
            by {review.isAnonymous ? 'Anonymous reviewer' : nameOf(review.reviewerId, 'Reviewer')}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
          <dt className="text-xs text-neutral-500">Overall</dt>
          <dd className="text-lg font-semibold tabular-nums">{review.rating ?? '—'}/5</dd>
        </div>
        {RUBRIC.map((c) => (
          <div key={c.key} className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-800">
            <dt className="text-xs text-neutral-500">{c.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {review.categories?.[c.key] ?? '—'}/5
            </dd>
          </div>
        ))}
      </dl>
      {review.feedback ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Comments</p>
          <p className="mt-1 whitespace-pre-line text-neutral-800 dark:text-neutral-200">
            {review.feedback}
          </p>
        </div>
      ) : (
        <p className="text-xs italic text-neutral-500">No written comments.</p>
      )}
      <p className="text-xs text-neutral-500">Submitted reviews are final and cannot be edited.</p>
    </div>
  );
}

// ── Review form ───────────────────────────────────────────────────────────────

function ReviewForm({ review, onDone }: { review: PeerReview; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState<number>();
  const [scores, setScores] = useState<Partial<Record<CategoryKey, number>>>({});
  const [feedback, setFeedback] = useState('');
  const [requiresFollowUp, setRequiresFollowUp] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const complete = rating !== undefined && RUBRIC.every((c) => scores[c.key] !== undefined);

  const submit = useMutation({
    mutationFn: () =>
      authJson<PeerReview>(`/peer-reviews/${review._id}`, {
        method: 'PUT',
        body: JSON.stringify({ rating, categories: scores, feedback, requiresFollowUp }),
      }),
    onSuccess: () => {
      toast.success('Peer review submitted');
      queryClient.invalidateQueries({ queryKey: ['peer-reviews'] });
      onDone();
    },
    onError: (err: Error) => {
      setConfirming(false);
      toast.error(err.message || 'Failed to submit review');
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        if (!confirming) setConfirming(true);
        else submit.mutate();
      }}
    >
      {RUBRIC.map((c) => (
        <ScoreInput
          key={c.key}
          name={`score-${c.key}`}
          label={c.label}
          hint={c.hint}
          value={scores[c.key]}
          onChange={(v) => {
            setConfirming(false);
            setScores((s) => ({ ...s, [c.key]: v }));
          }}
        />
      ))}
      <ScoreInput
        name="score-overall"
        label="Overall rating"
        value={rating}
        onChange={(v) => {
          setConfirming(false);
          setRating(v);
        }}
      />

      <Textarea
        id="review-comments"
        label="Comments"
        rows={5}
        maxLength={5000}
        value={feedback}
        onChange={(e) => {
          setConfirming(false);
          setFeedback(e.target.value);
        }}
        placeholder="What was done well, and what could be improved?"
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={requiresFollowUp}
          onChange={(e) => {
            setConfirming(false);
            setRequiresFollowUp(e.target.checked);
          }}
          className="mt-0.5 h-4 w-4 rounded border-neutral-300"
        />
        <span>
          <span className="font-medium text-neutral-800 dark:text-neutral-100">
            Requires follow-up
          </span>
          <span className="block text-xs text-neutral-500">
            Flags this encounter for clinical-quality follow-up by the clinic admin.
          </span>
        </span>
      </label>

      {confirming && (
        <div
          role="alert"
          className="border-warning-200 bg-warning-50 text-warning-800 dark:bg-warning-900/30 dark:text-warning-200 rounded-md border px-3 py-2 text-sm"
        >
          Submitted reviews can’t be edited. Click <strong>Confirm submission</strong> to finalise.
        </div>
      )}

      <div className="flex justify-end gap-2">
        {confirming && (
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep editing
          </Button>
        )}
        <Button type="submit" disabled={!complete} loading={submit.isPending}>
          {confirming ? 'Confirm submission' : 'Submit review'}
        </Button>
      </div>
      {!complete && (
        <p className="text-right text-xs text-neutral-500">Score every rubric item to submit.</p>
      )}
    </form>
  );
}

// ── Review panel (slide-over) ─────────────────────────────────────────────────

function ReviewPanel({
  review,
  mode,
  onClose,
}: {
  review: PeerReview | null;
  mode: 'review' | 'received';
  onClose: () => void;
}) {
  const encounterId = review?.encounterId?._id;
  return (
    <SlideOver
      isOpen={!!review}
      onClose={onClose}
      title={review?.encounterId?.chiefComplaint ?? 'Encounter review'}
      subtitle={mode === 'received' ? 'Peer review of your encounter' : 'Peer review'}
      width="w-full sm:w-[42rem] xl:w-[64rem]"
    >
      {review && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section aria-label="Encounter (read-only)">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Encounter <span className="font-normal text-neutral-500">(read-only)</span>
            </h3>
            {encounterId ? (
              <EncounterReadOnly encounterId={encounterId} />
            ) : (
              <p className="text-sm text-neutral-500">The encounter is no longer available.</p>
            )}
          </section>
          <section aria-label="Review">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {mode === 'received' ? 'Peer feedback' : 'Your review'}
            </h3>
            {review.status === 'completed' ? (
              <SubmittedReview review={review} showReviewer={mode === 'received'} />
            ) : (
              <ReviewForm review={review} onDone={onClose} />
            )}
          </section>
        </div>
      )}
    </SlideOver>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function ReviewTable({
  reviews,
  mode,
  onOpen,
}: {
  reviews: PeerReview[];
  mode: 'review' | 'received';
  onOpen: (r: PeerReview) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            <TableTh>Encounter</TableTh>
            <TableTh>{mode === 'review' ? 'Provider' : 'Reviewer'}</TableTh>
            <TableTh>{mode === 'review' ? 'Assigned' : 'Reviewed'}</TableTh>
            <TableTh>Status</TableTh>
            <TableTh className="text-right">Score</TableTh>
            <TableTh>
              <span className="sr-only">Actions</span>
            </TableTh>
          </TableRow>
        </TableHead>
        <TableBody>
          {reviews.map((r) => (
            <TableRow key={r._id}>
              <TableTd>
                <p className="font-medium text-neutral-900 dark:text-neutral-100">
                  {r.encounterId?.chiefComplaint ?? 'Encounter unavailable'}
                </p>
                <p className="text-xs text-neutral-500">{fmtDate(r.encounterId?.createdAt)}</p>
              </TableTd>
              <TableTd>
                {mode === 'review'
                  ? nameOf(r.revieweeId, '—')
                  : r.isAnonymous
                    ? 'Anonymous'
                    : nameOf(r.reviewerId, '—')}
              </TableTd>
              <TableTd>{fmtDate(mode === 'review' ? r.createdAt : r.completedAt)}</TableTd>
              <TableTd>
                <div className="flex flex-wrap gap-1">
                  {r.status === 'completed' ? (
                    <Badge variant="success">Submitted</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                  {r.requiresFollowUp && <Badge variant="danger">⚑ Follow-up</Badge>}
                </div>
              </TableTd>
              <TableTd className="text-right tabular-nums">
                {r.rating ? `${r.rating}/5` : '—'}
              </TableTd>
              <TableTd className="text-right">
                <Button
                  size="sm"
                  variant={r.status === 'completed' ? 'outline' : 'primary'}
                  onClick={() => onOpen(r)}
                >
                  {r.status === 'completed' ? 'View' : 'Review'}
                </Button>
              </TableTd>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AssignedTab({ userId }: { userId: string }) {
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [open, setOpen] = useState<PeerReview | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['peer-reviews', 'assigned'],
    queryFn: () => authJson<PeerReview[]>('/peer-reviews/assigned'),
  });

  // Defence in depth: the API excludes these too, but never offer a clinician their own encounter
  const reviews = useMemo(
    () =>
      (data ?? [])
        .filter((r) => idOf(r.revieweeId) !== userId)
        .filter((r) => filter === 'all' || (filter === 'completed') === (r.status === 'completed')),
    [data, filter, userId]
  );

  return (
    <>
      <div className="mb-4 flex gap-2">
        {(['pending', 'completed', 'all'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'secondary' : 'ghost'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>
      {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">✅</span>}
          title={filter === 'pending' ? 'No reviews waiting for you' : 'No reviews here'}
          description="Clinic admins assign encounters for peer review. Assigned reviews will appear here."
        />
      ) : (
        <ReviewTable reviews={reviews} mode="review" onOpen={setOpen} />
      )}
      <ReviewPanel review={open} mode="review" onClose={() => setOpen(null)} />
    </>
  );
}

function ReceivedTab() {
  const [open, setOpen] = useState<PeerReview | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['peer-reviews', 'received'],
    queryFn: () => authJson<PeerReview[]>('/peer-reviews/received'),
  });

  return (
    <>
      {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<span className="text-4xl">📋</span>}
          title="None of your encounters have been reviewed yet"
          description="When a colleague completes a peer review of one of your encounters, their scores and comments appear here."
        />
      ) : (
        <ReviewTable reviews={data} mode="received" onOpen={setOpen} />
      )}
      <ReviewPanel review={open} mode="received" onClose={() => setOpen(null)} />
    </>
  );
}

function SummaryTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['peer-reviews', 'stats'],
    queryFn: () => authJson<ProviderStat[]>('/peer-reviews/stats'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />;
  if (!data?.length) {
    return (
      <EmptyState
        icon={<span className="text-4xl">📊</span>}
        title="No completed peer reviews yet"
        description="Provider statistics appear once reviewers submit their first reviews."
      />
    );
  }

  const totals = data.reduce(
    (acc, s) => ({ reviews: acc.reviews + s.totalReviews, flags: acc.flags + s.followUpCount }),
    { reviews: 0, flags: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-neutral-500">Completed reviews</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.reviews}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Providers reviewed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{data.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Flagged for follow-up</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.flags}</p>
        </Card>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableTh>Provider</TableTh>
              <TableTh className="text-right">Reviews</TableTh>
              <TableTh className="text-right">Overall</TableTh>
              {RUBRIC.map((c) => (
                <TableTh key={c.key} className="text-right">
                  {c.label}
                </TableTh>
              ))}
              <TableTh className="text-right">Follow-ups</TableTh>
              <TableTh>Last review</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((s) => (
              <TableRow key={s._id}>
                <TableTd className="font-medium">{s.doctor?.fullName ?? 'Unknown'}</TableTd>
                <TableTd className="text-right tabular-nums">{s.totalReviews}</TableTd>
                <TableTd className="text-right tabular-nums">{fmtScore(s.averageRating)}</TableTd>
                <TableTd className="text-right tabular-nums">
                  {fmtScore(s.avgDocumentation)}
                </TableTd>
                <TableTd className="text-right tabular-nums">{fmtScore(s.avgDiagnosis)}</TableTd>
                <TableTd className="text-right tabular-nums">{fmtScore(s.avgTreatment)}</TableTd>
                <TableTd className="text-right tabular-nums">{fmtScore(s.avgFollowUp)}</TableTd>
                <TableTd className="text-right tabular-nums">
                  {s.followUpCount > 0 ? <Badge variant="danger">⚑ {s.followUpCount}</Badge> : '0'}
                </TableTd>
                <TableTd>{fmtDate(s.lastReviewedAt)}</TableTd>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-neutral-500">Scores are averages on a 1–5 scale.</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PeerReviewsClient() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const canReview = user?.role === 'DOCTOR' || isAdmin;
  const [tab, setTab] = useState('assigned');

  if (loading) {
    return (
      <PageWrapper className="flex justify-center py-16">
        <Spinner />
      </PageWrapper>
    );
  }

  if (!user || !canReview) {
    return (
      <PageWrapper className="py-8">
        <PageHeader title="Peer Review & QA" />
        <EmptyState
          title="Peer review is available to clinicians"
          description="Only doctors and clinic admins can take part in peer review."
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="py-8">
      <PageHeader
        title="Peer Review & QA"
        subtitle="Review colleagues’ encounters and see feedback on your own"
      />
      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Peer reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="assigned">Assigned to me</TabsTrigger>
              <TabsTrigger value="received">My encounters reviewed</TabsTrigger>
              {isAdmin && <TabsTrigger value="summary">Provider summary</TabsTrigger>}
            </TabsList>
            <TabsContent value="assigned">
              <AssignedTab userId={user.userId} />
            </TabsContent>
            <TabsContent value="received">
              <ReceivedTab />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="summary">
                <SummaryTab />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
