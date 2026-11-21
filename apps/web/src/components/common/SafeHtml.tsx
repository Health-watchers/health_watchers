'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useMemo } from 'react';

export interface SafeHtmlProps {
  /** Untrusted HTML to sanitise and render. */
  html: string | null | undefined;
  /** Optional className applied to the wrapper element. */
  className?: string;
  /** Optional id applied to the wrapper element. */
  id?: string;
  /** Optional data-testid applied to the wrapper element. */
  'data-testid'?: string;
}

/**
 * Renders untrusted HTML after sanitising it at render time.
 *
 * This is the ONLY place in the codebase where `dangerouslySetInnerHTML`
 * is permitted (enforced via the `react/no-danger` ESLint rule). Sanitising
 * on the client provides defence in depth on top of server-side sanitisation,
 * protecting against records written before sanitisation existed, records
 * imported via FHIR or migrations, and records written by other services.
 */
export function SafeHtml({
  html,
  className,
  id,
  'data-testid': dataTestId,
}: SafeHtmlProps) {
  const sanitized = useMemo(() => {
    if (!html) {
      return '';
    }
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [html]);

  if (!sanitized) {
    return null;
  }

  return (
    <div
      className={className}
      id={id}
      data-testid={dataTestId}
      // eslint-disable-next-line react/no-danger -- sanitised above via DOMPurify
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export default SafeHtml;
```

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeHtml } from './SafeHtml';

describe('SafeHtml', () => {
  it('renders benign HTML', () => {
    render(<SafeHtml html="<p>Hello <strong>world</strong></p>" />);
    expect(screen.getByText('world')).toBeInTheDocument();
    expect(screen.getByText('world').tagName).toBe('STRONG');
  });

  it('neutralises an img onerror XSS payload', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = render(<SafeHtml html={payload} />);

    const img = container.querySelector('img');
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('alert(1)');
  });

  it('strips script tags', () => {
    const payload = '<script>alert(1)</script><p>safe</p>';
    const { container } = render(<SafeHtml html={payload} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('alert(1)');
    expect(screen.getByText('safe')).toBeInTheDocument();
  });

  it('strips javascript: URLs from anchors', () => {
    const payload = '<a href="javascript:alert(1)">click</a>';
    const { container } = render(<SafeHtml html={payload} />);

    const anchor = container.querySelector('a');
    if (anchor) {
      expect(anchor.getAttribute('href') ?? '').not.toContain('javascript:');
    }
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('renders nothing for empty or null input', () => {
    const { container: emptyContainer } = render(<SafeHtml html="" />);
    expect(emptyContainer.firstChild).toBeNull();

    const { container: nullContainer } = render(<SafeHtml html={null} />);
    expect(nullContainer.firstChild).toBeNull();
  });

  it('applies className and data-testid to the wrapper', () => {
    render(
      <SafeHtml
        html="<p>content</p>"
        className="prose"
        data-testid="safe-html"
      />,
    );
    const wrapper = screen.getByTestId('safe-html');
    expect(wrapper).toHaveClass('prose');
  });
});