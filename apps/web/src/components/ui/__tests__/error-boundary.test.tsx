import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from '../error-boundary';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

// Mock Sentry so we can assert the boundary reports errors without a real DSN.
const captureException = jest.fn();
const withScope = jest.fn((cb: (scope: unknown) => void) =>
  cb({ setTag: jest.fn(), setContext: jest.fn() })
);
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  withScope: (cb: (scope: unknown) => void) => withScope(cb),
}));

function Bomb({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error('boom');
  return <div>safe content</div>;
}

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error; silence it for clean test output.
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>healthy</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders the fallback UI with an error ID when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Error ID:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reports the error to Sentry', () => {
    render(
      <ErrorBoundary name="test-section">
        <Bomb explode />
      </ErrorBoundary>
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });

  it('supports a custom render-prop fallback with a working retry', () => {
    function Wrapper() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <button
              onClick={() => {
                setExplode(false);
                reset();
              }}
            >
              recover: {error.message}
            </button>
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      );
    }
    render(<Wrapper />);
    expect(screen.getByText('recover: boom')).toBeInTheDocument();
    fireEvent.click(screen.getByText('recover: boom'));
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('keeps siblings alive when one section errors', () => {
    render(
      <div>
        <SectionErrorBoundary name="payment panel">
          <Bomb explode />
        </SectionErrorBoundary>
        <div>sibling section</div>
      </div>
    );
    // The errored section shows the compact alert...
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn’t be displayed/)).toBeInTheDocument();
    // ...while the rest of the page stays rendered.
    expect(screen.getByText('sibling section')).toBeInTheDocument();
  });
});
