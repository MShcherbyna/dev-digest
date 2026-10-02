import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig({});
    expect(c.apiUrl).toBe('http://localhost:3001');
    expect(c.runWaitMs).toBe(120_000);
    expect(c.pollMs).toBe(3_000);
    expect(c.maxRuns).toBe(5);
    expect(c.runWindowMs).toBe(600_000);
  });

  it('treats an empty string as unset', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '' }).apiUrl).toBe('http://localhost:3001');
  });

  it('accepts loopback hosts', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:4000/' }).apiUrl).toBe('http://127.0.0.1:4000');
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://[::1]:4000' }).apiUrl).toBe('http://[::1]:4000');
  });

  it('rejects a non-loopback API URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'https://example.com' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'http://localhost.evil.com' })).toThrow(ConfigError);
  });

  it('rejects out-of-range numbers', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_RUN_WAIT_MS: '9999999' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_POLL_MS: '1' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_MAX_RUNS: '0' })).toThrow(ConfigError);
  });
});
