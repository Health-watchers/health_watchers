import { Request, Response } from 'express';
import { apiVersionHeader, deprecated } from '../versioning.middleware';

function mockRes() {
  const res: Partial<Response> = { set: jest.fn().mockReturnThis() };
  return res as Response;
}

describe('versioning.middleware', () => {
  it('apiVersionHeader sets the API-Version header', () => {
    const res = mockRes();
    const next = jest.fn();

    apiVersionHeader('v1')({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('API-Version', 'v1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deprecated sets Deprecation/Sunset headers and an optional Link header', () => {
    const res = mockRes();
    const next = jest.fn();

    deprecated('2027-01-01', '/api/v2/foo')({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.set).toHaveBeenCalledWith('Sunset', '2027-01-01');
    expect(res.set).toHaveBeenCalledWith('Link', '</api/v2/foo>; rel="successor-version"');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deprecated omits the Link header when no successor URL is given', () => {
    const res = mockRes();
    const next = jest.fn();

    deprecated('2027-01-01')({} as Request, res, next);

    expect(res.set).not.toHaveBeenCalledWith('Link', expect.anything());
    expect(next).toHaveBeenCalledTimes(1);
  });
});
