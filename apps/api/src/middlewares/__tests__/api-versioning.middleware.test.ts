import { Request, Response } from 'express';
import {
  apiVersionHeader,
  deprecated,
  v1DeprecationWarning,
  getSupportedVersions,
  API_VERSIONS,
} from '../api-versioning.middleware';

function mockRes() {
  const res: Partial<Response> = { set: jest.fn().mockReturnThis() };
  return res as Response;
}

describe('apiVersionHeader', () => {
  it('sets the API-Version header and calls next', () => {
    const res = mockRes();
    const next = jest.fn();

    apiVersionHeader('v2')({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('API-Version', 'v2');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('deprecated', () => {
  it('sets Deprecation and Sunset headers without a successor link', () => {
    const res = mockRes();
    const next = jest.fn();

    deprecated('2026-12-31')({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.set).toHaveBeenCalledWith('Sunset', '2026-12-31');
    expect(res.set).not.toHaveBeenCalledWith('Link', expect.anything());
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets the Link header when a successor URL is provided', () => {
    const res = mockRes();
    const next = jest.fn();

    deprecated('2026-12-31', '/api/v2/patients')({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Link', '</api/v2/patients>; rel="successor-version"');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('v1DeprecationWarning', () => {
  it('sets deprecation, sunset, link and warning headers', () => {
    const res = mockRes();
    const next = jest.fn();

    v1DeprecationWarning({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.set).toHaveBeenCalledWith('Sunset', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(res.set).toHaveBeenCalledWith('Link', '</api/v2>; rel="successor-version"');
    expect(res.set).toHaveBeenCalledWith('Warning', expect.stringContaining('API v1 is deprecated'));
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('getSupportedVersions', () => {
  it('returns all versions with current, deprecated and sunset buckets', () => {
    const result = getSupportedVersions();

    expect(result.versions).toEqual(API_VERSIONS);
    expect(result.current).toBe('v2');
    expect(result.deprecated).toEqual([]);
    expect(result.sunset).toEqual([]);
  });
});
