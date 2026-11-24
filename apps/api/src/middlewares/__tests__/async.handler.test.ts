import { asyncHandler } from '../async.handler';
import { asyncHandler as canonicalAsyncHandler } from '../../utils/asyncHandler';

describe('async.handler re-export', () => {
  it('re-exports the canonical asyncHandler implementation', () => {
    expect(asyncHandler).toBe(canonicalAsyncHandler);
  });
});
