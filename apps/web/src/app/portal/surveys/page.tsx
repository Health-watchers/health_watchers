'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type QuestionType = 'multiple_choice' | 'likert' | 'free_text' | 'date';

interface SurveyQuestion {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

interface Survey {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  dueDate?: string;
  status?: 'pending' | 'completed';
}

type AnswerValue = string | number | null;

type Answers = Record<string, AnswerValue>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function fetchPendingSurveys(): Promise<Survey[]> {
  const res = await fetch(`${API_BASE}/portal/surveys?status=pending`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to load surveys');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.surveys ?? [];
}

async function submitSurveyResponses(
  surveyId: string,
  answers: Answers,
): Promise<void> {
  const res = await fetch(`${API_BASE}/portal/surveys/${surveyId}/responses`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    throw new Error('Failed to submit survey');
  }
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isAnswered(question: SurveyQuestion, value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function defaultLikertRange(question: SurveyQuestion): number[] {
  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 5;
  const range: number[] = [];
  for (let i = min; i <= max; i += 1) range.push(i);
  return range;
}

interface QuestionFieldProps {
  question: SurveyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  switch (question.type) {
    case 'multiple_choice':
      return (
        <fieldset className="space-y-2">
          <legend className="sr-only">{question.text}</legend>
          {(question.options ?? []).map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-800">{option}</span>
            </label>
          ))}
        </fieldset>
      );

    case 'likert': {
      const range = defaultLikertRange(question);
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {range.map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => onChange(score)}
                aria-pressed={value === score}
                className={`h-10 w-10 rounded-full border text-sm font-medium transition-colors ${
                  value === score
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{question.scaleMinLabel ?? 'Low'}</span>
            <span>{question.scaleMaxLabel ?? 'High'}</span>
          </div>
        </div>
      );
    }

    case 'free_text':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Type your answer..."
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );

    default:
      return null;
  }
}

interface SurveyCompletionProps {
  survey: Survey;
  onClose: () => void;
  onCompleted: (surveyId: string) => void;
}

function SurveyCompletion({ survey, onClose, onCompleted }: SurveyCompletionProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = survey.questions ?? [];
  const total = questions.length;
  const currentQuestion = questions[currentIndex];
  const progress = total === 0 ? 0 : Math.round(((currentIndex + 1) / total) * 100);

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const currentAnswered = currentQuestion
    ? isAnswered(currentQuestion, answers[currentQuestion.id] ?? null)
    : false;

  const canAdvance = !currentQuestion?.required || currentAnswered;

  const handleNext = () => {
    if (!canAdvance) return;
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
    if (!canAdvance) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitSurveyResponses(survey.id, answers);
      onCompleted(survey.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (total === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-600">This survey has no questions.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Close
        </button>
      </div>
    );
  }

  const isLast = currentIndex === total - 1;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{survey.title}</h2>
          {survey.description && (
            <p className="mt-1 text-sm text-gray-600">{survey.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      <div className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>
            Question {currentIndex + 1} of {total}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {currentQuestion && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900">
              {currentQuestion.text}
              {currentQuestion.required && (
                <span className="ml-1 text-red-500" aria-hidden="true">
                  *
                </span>
              )}
            </label>
          </div>
          <QuestionField
            question={currentQuestion}
            value={answers[currentQuestion.id] ?? null}
            onChange={(value) => setAnswer(currentQuestion.id, value)}
          />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentIndex === 0 || submitting}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canAdvance || submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

export default function PortalSurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [thankYou, setThankYou] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingSurveys();
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSurveys();
  }, [loadSurveys]);

  const pendingSurveys = useMemo(
    () => surveys.filter((s) => !completedIds.includes(s.id)),
    [surveys, completedIds],
  );

  const handleCompleted = (surveyId: string) => {
    setCompletedIds((prev) => [...prev, surveyId]);
    setActiveSurvey(null);
    setThankYou(surveyId);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
          <p className="mt-1 text-sm text-gray-600">
            Share your feedback by completing the surveys below.
          </p>
        </div>
        <Link
          href="/portal"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Back to portal
        </Link>
      </div>

      {thankYou && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            Thank you! Your responses have been submitted.
          </p>
          <button
            type="button"
            onClick={() => setThankYou(null)}
            className="mt-2 text-sm font-medium text-green-700 underline hover:text-green-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeSurvey ? (
        <SurveyCompletion
          survey={activeSurvey}
          onClose={() => setActiveSurvey(null)}
          onCompleted={handleCompleted}
        />
      ) : (
        <>
          {loading && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
              Loading surveys...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void loadSurveys()}
                className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && pendingSurveys.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
              <p className="text-sm text-gray-600">
                You have no pending surveys. Check back later.
              </p>
            </div>
          )}

          {!loading && !error && pendingSurveys.length > 0 && (
            <ul className="space-y-3">
              {pendingSurveys.map((survey) => (
                <li
                  key={survey.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        {survey.title}
                      </h2>
                      {survey.description && (
                        <p className="mt-1 text-sm text-gray-600">
                          {survey.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        {survey.questions?.length ?? 0} question
                        {(survey.questions?.length ?? 0) === 1 ? '' : 's'}
                        {survey.dueDate && (
                          <> &middot; Due {formatDate(survey.dueDate)}</>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setThankYou(null);
                        setActiveSurvey(survey);
                      }}
                      className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Start
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}