'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorMessage,
  Input,
  PageHeader,
  PageWrapper,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
} from '@/components/ui';
import { authJson } from '@/lib/authJson';
import { formatPeriod, type SurveyTrendPoint } from '@/components/charts/surveyTrend.utils';

const SurveyTrendChart = dynamic(() => import('@/components/charts/SurveyTrendChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Bucket = 'day' | 'week' | 'month';

interface Scores {
  responses: number;
  csat: number | null;
  nps: number | null;
  avgOverall: number | null;
}

interface ProviderRow extends Scores {
  doctorId: string;
  name: string;
  avgCommunication: number;
  avgWaitTime: number;
}

interface SurveyComment {
  id: string;
  comment: string;
  overallSatisfaction: number;
  wouldRecommend: boolean;
  completedAt: string;
  doctorId: string;
  doctorName: string;
}

interface SurveyResults {
  range: { from: string; to: string; bucket: Bucket };
  summary: Scores & { totalSent: number; responseRate: number | null };
  trend: SurveyTrendPoint[];
  providers: ProviderRow[];
  comments: SurveyComment[];
}

// ── Date range ────────────────────────────────────────────────────────────────

type Preset = '30d' | '90d' | '12m' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (preset === '30d') from.setDate(from.getDate() - 29);
  else if (preset === '90d') from.setDate(from.getDate() - 89);
  else from.setMonth(from.getMonth() - 12);
  return { from: isoDate(from), to: isoDate(to) };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const fmtNps = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}`);
const fmtPct = (v: number | null) => (v === null ? '—' : `${v}%`);
const fmtRating = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} / 5`);

// ── Pieces ────────────────────────────────────────────────────────────────────

function ScoreTile({
  label,
  value,
  detail,
  help,
}: {
  label: string;
  value: string;
  detail?: string;
  help: string;
}) {
  return (
    <Card role="group" aria-label={label}>
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400" title={help}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
      <p className="sr-only">{help}</p>
    </Card>
  );
}

function TrendTable({ data, bucket }: { data: SurveyTrendPoint[]; bucket: Bucket }) {
  return (
    <div className="max-h-72 overflow-auto">
      <Table>
        <TableHead>
          <TableRow>
            <TableTh>
              {bucket === 'week' ? 'Week of' : bucket === 'month' ? 'Month' : 'Day'}
            </TableTh>
            <TableTh className="text-right">Responses</TableTh>
            <TableTh className="text-right">NPS</TableTh>
            <TableTh className="text-right">CSAT</TableTh>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((p) => (
            <TableRow key={p.period}>
              <TableTd>{formatPeriod(p.period, bucket === 'month' ? 'month' : 'day')}</TableTd>
              <TableTd className="text-right tabular-nums">{p.responses}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtNps(p.nps)}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtPct(p.csat)}</TableTd>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type SortKey = 'name' | 'responses' | 'avgOverall' | 'csat' | 'nps';

function ProviderTable({ rows }: { rows: ProviderRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'responses',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    return (
      <TableTh
        className={align === 'right' ? 'text-right' : undefined}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium hover:text-neutral-900 dark:hover:text-neutral-100"
          onClick={() =>
            setSort((s) => ({
              key,
              dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc',
            }))
          }
        >
          {label}
          <span aria-hidden="true" className="text-neutral-400">
            {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
          </span>
        </button>
      </TableTh>
    );
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            {header('name', 'Provider', 'left')}
            {header('responses', 'Responses')}
            {header('avgOverall', 'Avg rating')}
            {header('csat', 'CSAT')}
            {header('nps', 'NPS')}
            <TableTh className="text-right">Communication</TableTh>
            <TableTh className="text-right">Wait time</TableTh>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.doctorId}>
              <TableTd className="font-medium">{r.name}</TableTd>
              <TableTd className="text-right tabular-nums">{r.responses}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtRating(r.avgOverall)}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtPct(r.csat)}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtNps(r.nps)}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtRating(r.avgCommunication)}</TableTd>
              <TableTd className="text-right tabular-nums">{fmtRating(r.avgWaitTime)}</TableTd>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.some((r) => r.responses < 5) && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Scores based on fewer than 5 responses are volatile — compare providers with care.
        </p>
      )}
    </div>
  );
}

function CommentsList({
  comments,
  rangeFrom,
  rangeTo,
}: {
  comments: SurveyComment[];
  rangeFrom: string;
  rangeTo: string;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [provider, setProvider] = useState('');
  const [sentiment, setSentiment] = useState<'' | 'positive' | 'negative'>('');

  const providers = useMemo(() => {
    const m = new Map<string, string>();
    comments.forEach((c) => m.set(c.doctorId, c.doctorName));
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [comments]);

  const filtered = comments.filter((c) => {
    const day = isoDate(new Date(c.completedAt));
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (provider && c.doctorId !== provider) return false;
    if (sentiment === 'positive' && c.overallSatisfaction < 4) return false;
    if (sentiment === 'negative' && c.overallSatisfaction > 2) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="date"
          label="From"
          id="comments-from"
          value={from}
          min={rangeFrom}
          max={to || rangeTo}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          label="To"
          id="comments-to"
          value={to}
          min={from || rangeFrom}
          max={rangeTo}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select
          label="Provider"
          id="comments-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="All providers"
          options={providers}
        />
        <Select
          label="Rating"
          id="comments-rating"
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value as typeof sentiment)}
          placeholder="All ratings"
          options={[
            { value: 'positive', label: 'Satisfied (4–5)' },
            { value: 'negative', label: 'Dissatisfied (1–2)' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No comments match these filters.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700" aria-live="polite">
          {filtered.map((c) => (
            <li key={c.id} className="py-3">
              <p className="whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-100">
                “{c.comment}”
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span>
                  {new Date(c.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </span>
                <span>{c.doctorName}</span>
                <span>Rated {c.overallSatisfaction}/5</span>
                <span>{c.wouldRecommend ? 'Would recommend' : 'Would not recommend'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Showing {filtered.length} of {comments.length} comments
        {comments.length >= 200 ? ' (most recent 200 in range)' : ''}.
      </p>
    </div>
  );
}

function SurveysEmptyState({ totalSent }: { totalSent: number }) {
  return (
    <Card>
      <EmptyState
        icon={<span className="text-4xl">📝</span>}
        title={totalSent > 0 ? 'No survey responses yet' : 'No patient surveys in this period'}
        description={
          totalSent > 0
            ? `${totalSent} survey${totalSent === 1 ? ' was' : 's were'} sent in this period, but no patient has completed one yet. Results appear here as soon as the first response comes in.`
            : undefined
        }
        className="py-10"
      />
      <div className="mx-auto max-w-xl pb-8 text-sm text-neutral-600 dark:text-neutral-300">
        <p className="font-medium text-neutral-800 dark:text-neutral-100">How surveys are sent</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            A satisfaction survey is created automatically when a clinician{' '}
            <strong>closes an encounter</strong> — there is nothing to switch on.
          </li>
          <li>The patient receives a private survey link about 2 hours after the visit.</li>
          <li>The link stays open for 7 days; each survey can be answered once.</li>
          <li>
            Completed responses — ratings, “would recommend”, and optional comments — show up on
            this page, attributed to the attending provider.
          </li>
        </ol>
        <p className="mt-3">
          No results yet? Check that encounters are being closed in{' '}
          <Link href="/encounters" className="text-primary-600 dark:text-primary-400 underline">
            Encounters
          </Link>{' '}
          or widen the date range above.
        </p>
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveysClient() {
  const [preset, setPreset] = useState<Preset>('90d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');

  const { from, to } =
    preset === 'custom' && customFrom && customTo && customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : presetRange(preset === 'custom' ? '90d' : preset);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['survey-results', from, to],
    queryFn: () => authJson<SurveyResults>(`/surveys/results?from=${from}&to=${to}`),
    placeholderData: (prev) => prev,
  });

  const summary = data?.summary;
  const bucket = data?.range.bucket ?? 'day';
  const hasResponses = (summary?.responses ?? 0) > 0;

  return (
    <PageWrapper className="py-8">
      <PageHeader
        title="Patient Surveys"
        subtitle="Satisfaction and loyalty scores from post-visit surveys"
        actions={
          <Link
            href="/reports"
            className="text-primary-600 dark:text-primary-400 text-sm hover:underline"
          >
            ← All reports
          </Link>
        }
      />

      {/* Filters — one row above everything they control */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div
          className="flex rounded-md border border-neutral-200 p-0.5 dark:border-neutral-700"
          role="radiogroup"
          aria-label="Date range"
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={[
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                preset === p.value
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <Input
              type="date"
              label="From"
              id="surveys-from"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <Input
              type="date"
              label="To"
              id="surveys-to"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {new Date(`${from}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })} –{' '}
          {new Date(`${to}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </p>
      </div>

      {error && (
        <ErrorMessage
          message={(error as Error).message || 'Failed to load survey results'}
          onRetry={() => refetch()}
        />
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {data && !hasResponses && <SurveysEmptyState totalSent={summary?.totalSent ?? 0} />}

      {data && hasResponses && summary && (
        <div className="space-y-6">
          {/* Score tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <ScoreTile
              label="NPS"
              value={fmtNps(summary.nps)}
              detail="% would recommend − % would not"
              help="Net Promoter Score: percentage of patients who would recommend the clinic minus the percentage who would not. Ranges from −100 to +100."
            />
            <ScoreTile
              label="CSAT"
              value={fmtPct(summary.csat)}
              detail="Rated overall visit 4 or 5 of 5"
              help="Customer satisfaction: share of responses rating overall satisfaction 4 or 5 out of 5."
            />
            <ScoreTile
              label="Average rating"
              value={fmtRating(summary.avgOverall)}
              detail="Overall satisfaction"
              help="Mean overall satisfaction score across all responses, from 1 to 5."
            />
            <ScoreTile
              label="Responses"
              value={summary.responses.toLocaleString()}
              detail={
                summary.responseRate !== null
                  ? `${summary.responseRate}% of ${summary.totalSent.toLocaleString()} sent`
                  : undefined
              }
              help="Number of completed surveys in the selected period, and the share of surveys sent in the period that were completed."
            />
          </div>

          {/* Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>
                Trend by {bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : 'month'}
              </CardTitle>
              <div
                className="flex rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-700"
                role="radiogroup"
                aria-label="Trend view"
              >
                {(['chart', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={trendView === v}
                    onClick={() => setTrendView(v)}
                    className={[
                      'rounded px-2.5 py-1 font-medium capitalize',
                      trendView === v
                        ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                        : 'text-neutral-500 dark:text-neutral-400',
                    ].join(' ')}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {trendView === 'chart' ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <figure>
                    <figcaption className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      NPS <span className="font-normal text-neutral-500">(−100 to +100)</span>
                    </figcaption>
                    <SurveyTrendChart data={data.trend} metric="nps" bucket={bucket} />
                  </figure>
                  <figure>
                    <figcaption className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      CSAT <span className="font-normal text-neutral-500">(% satisfied)</span>
                    </figcaption>
                    <SurveyTrendChart data={data.trend} metric="csat" bucket={bucket} />
                  </figure>
                  <p className="text-xs text-neutral-500 lg:col-span-2 dark:text-neutral-400">
                    Gaps mark periods with no completed surveys.
                  </p>
                </div>
              ) : (
                <TrendTable data={data.trend} bucket={bucket} />
              )}
            </CardContent>
          </Card>

          {/* Per-provider */}
          <Card>
            <CardHeader>
              <CardTitle>By provider</CardTitle>
            </CardHeader>
            <CardContent>
              <ProviderTable rows={data.providers} />
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>Patient comments</CardTitle>
            </CardHeader>
            <CardContent>
              {data.comments.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No free-text comments in this period — comments are optional on the survey.
                </p>
              ) : (
                <CommentsList comments={data.comments} rangeFrom={from} rangeTo={to} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
