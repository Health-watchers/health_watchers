'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface DexPath {
  sourceAsset: string;
  destinationAsset: string;
  destinationAmount: string;
  rate: string;
  path: string[];
  conversionFee: string;
}

export interface DexQuote {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmount: string;
  destinationAmount: string;
  rate: string;
  path: string[];
  conversionFee: string;
  slippageTolerance: number;
  quotedAt: string;
}

interface PaymentSubmission {
  amount: string;
  currency: string;
  dexQuote?: DexQuote;
  slippageTolerance?: number;
}

const DEFAULT_SLIPPAGE_TOLERANCE = 1;
const SLIPPAGE_OPTIONS = [0.5, 1, 2, 5];
const XLM_ASSET = 'XLM';

export default function PaymentsClient() {
  const t = useTranslations('payments');

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(XLM_ASSET);
  const [paths, setPaths] = useState<DexPath[]>([]);
  const [selectedPath, setSelectedPath] = useState<DexPath | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE_TOLERANCE);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [pathsError, setPathsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isConversion = currency !== XLM_ASSET;

  const fetchPaths = useCallback(async () => {
    if (!isConversion || !amount || Number(amount) <= 0) {
      setPaths([]);
      setSelectedPath(null);
      return;
    }

    setLoadingPaths(true);
    setPathsError(null);
    try {
      const params = new URLSearchParams({
        sourceAsset: currency,
        destinationAsset: XLM_ASSET,
        sourceAmount: amount,
      });
      const res = await fetch(`/api/payments/dex/paths?${params.toString()}`);
      if (!res.ok) {
        throw new Error(t('dex.pathsError'));
      }
      const data = (await res.json()) as { paths: DexPath[] };
      setPaths(data.paths ?? []);
      setSelectedPath(data.paths && data.paths.length > 0 ? data.paths[0] : null);
    } catch (err) {
      setPathsError(err instanceof Error ? err.message : t('dex.pathsError'));
      setPaths([]);
      setSelectedPath(null);
    } finally {
      setLoadingPaths(false);
    }
  }, [amount, currency, isConversion, t]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchPaths();
    }, 400);
    return () => clearTimeout(handle);
  }, [fetchPaths]);

  const buildQuote = useCallback((): DexQuote | undefined => {
    if (!selectedPath) return undefined;
    return {
      sourceAsset: selectedPath.sourceAsset,
      destinationAsset: selectedPath.destinationAsset,
      sourceAmount: amount,
      destinationAmount: selectedPath.destinationAmount,
      rate: selectedPath.rate,
      path: selectedPath.path,
      conversionFee: selectedPath.conversionFee,
      slippageTolerance,
      quotedAt: new Date().toISOString(),
    };
  }, [amount, selectedPath, slippageTolerance]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      setSubmitSuccess(false);

      if (isConversion && !selectedPath) {
        setSubmitError(t('dex.noPathSelected'));
        return;
      }

      const payload: PaymentSubmission = {
        amount,
        currency,
      };

      if (isConversion) {
        payload.dexQuote = buildQuote();
        payload.slippageTolerance = slippageTolerance;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? t('submitError'));
        }
        setSubmitSuccess(true);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : t('submitError'));
      } finally {
        setSubmitting(false);
      }
    },
    [amount, buildQuote, currency, isConversion, selectedPath, slippageTolerance, t],
  );

  const conversionFeeDisplay = useMemo(() => {
    if (!selectedPath) return null;
    return selectedPath.conversionFee;
  }, [selectedPath]);

  return (
    <div className="payments-page">
      <h1>{t('title')}</h1>

      <form onSubmit={handleSubmit} className="payments-form">
        <div className="form-field">
          <label htmlFor="amount">{t('amountLabel')}</label>
          <input
            id="amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="currency">{t('currencyLabel')}</label>
          <input
            id="currency"
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder={t('currencyPlaceholder')}
            required
          />
          <small>{t('dex.currencyHint')}</small>
        </div>

        {isConversion && (
          <section className="dex-paths" aria-live="polite">
            <h2>{t('dex.pathsTitle')}</h2>
            {loadingPaths && <p>{t('dex.loadingPaths')}</p>}
            {pathsError && <p className="error">{pathsError}</p>}
            {!loadingPaths && !pathsError && paths.length === 0 && amount && (
              <p>{t('dex.noPaths')}</p>
            )}
            {paths.length > 0 && (
              <ul className="dex-path-list">
                {paths.map((p, idx) => {
                  const selected = selectedPath === p;
                  return (
                    <li key={`${p.sourceAsset}-${p.destinationAsset}-${idx}`}>
                      <label>
                        <input
                          type="radio"
                          name="dexPath"
                          checked={selected}
                          onChange={() => setSelectedPath(p)}
                        />
                        <span>
                          {t('dex.pathSummary', {
                            source: p.sourceAsset,
                            destination: p.destinationAsset,
                            rate: p.rate,
                          })}
                        </span>
                        <span className="dex-path-fee">
                          {t('dex.conversionFee', { fee: p.conversionFee })}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="form-field">
              <label htmlFor="slippage">{t('dex.slippageLabel')}</label>
              <select
                id="slippage"
                value={slippageTolerance}
                onChange={(e) => setSlippageTolerance(Number(e.target.value))}
              >
                {SLIPPAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}%
                  </option>
                ))}
              </select>
              <small>{t('dex.slippageHint')}</small>
            </div>
          </section>
        )}

        <section className="payment-breakdown">
          <h2>{t('breakdown.title')}</h2>
          <dl>
            <dt>{t('breakdown.amount')}</dt>
            <dd>
              {amount || '0'} {currency}
            </dd>
            {isConversion && selectedPath && (
              <>
                <dt>{t('breakdown.convertedAmount')}</dt>
                <dd>
                  {selectedPath.destinationAmount} {selectedPath.destinationAsset}
                </dd>
                <dt>{t('breakdown.exchangeRate')}</dt>
                <dd>{selectedPath.rate}</dd>
                <dt>{t('breakdown.dexConversionFee')}</dt>
                <dd>{conversionFeeDisplay}</dd>
              </>
            )}
          </dl>
        </section>

        {submitError && <p className="error">{submitError}</p>}
        {submitSuccess && <p className="success">{t('submitSuccess')}</p>}

        <button type="submit" disabled={submitting || (isConversion && !selectedPath)}>
          {submitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}