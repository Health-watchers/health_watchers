import '@testing-library/jest-dom';

// jest-axe is optional — only extend if the package is installed
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { toHaveNoViolations } = require('jest-axe');
  expect.extend(toHaveNoViolations);
} catch {
  // jest-axe not installed — accessibility matchers unavailable
}
