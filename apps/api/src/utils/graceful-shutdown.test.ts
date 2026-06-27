import { createServer } from 'http';
import { trackConnections, registerGracefulShutdown } from './graceful-shutdown';

jest.mock('./logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('mongoose', () => ({
  connection: { close: jest.fn().mockResolvedValue(undefined) },
}));

describe('trackConnections', () => {
  it('returns a function without throwing', () => {
    const server = createServer();
    const destroyIdle = trackConnections(server);
    expect(typeof destroyIdle).toBe('function');
    server.close();
  });

  it('destroyIdle does not throw on an empty connection set', () => {
    const server = createServer();
    const destroyIdle = trackConnections(server);
    expect(() => destroyIdle()).not.toThrow();
    server.close();
  });
});

describe('registerGracefulShutdown', () => {
  it('registers process signal handlers without throwing', () => {
    const server = createServer();
    const stopJob = jest.fn();
    expect(() =>
      registerGracefulShutdown(server, { stopJobs: [stopJob], timeoutMs: 100 }),
    ).not.toThrow();
    server.close();
  });
});
