/** Run-command checker (AC-11) and the dependency-free compose reader. */
import { describe, it, expect } from 'vitest';
import { checkCommand, readComposeServices } from '../src/modules/onboarding/commands.js';

const scripts = new Set(['dev', 'build', 'test']);
const services = new Set(['postgres', 'redis']);
const ok = (cmd: string) => checkCommand(cmd, scripts, services).ok;

describe('checkCommand (AC-11)', () => {
  it('keeps declared scripts/services and unrelated commands, drops undeclared ones', () => {
    // Catches: the tour telling a newcomer to run a script or compose service that does not exist.
    expect(ok('pnpm dev')).toBe(true);
    expect(ok('pnpm start:prod')).toBe(false);
    expect(checkCommand('pnpm start:prod', scripts, services)).toEqual({ ok: false, reason: 'undeclared_script' });
    expect(ok('docker compose up -d postgres redis')).toBe(true);
    expect(ok('docker compose up -d kafka')).toBe(false);
    expect(checkCommand('docker compose up -d kafka', scripts, services)).toEqual({
      ok: false,
      reason: 'undeclared_service',
    });
    // a trailing comment is not parsed as arguments, and the command is not rewritten
    expect(ok('cp .env.example .env # add OPENAI + STRIPE keys')).toBe(true);
    // builtins and declared `run` scripts, plus a `cd` prefix
    expect(ok('pnpm install')).toBe(true);
    expect(ok('npm run build')).toBe(true);
    expect(ok('npm run nope')).toBe(false);
    expect(ok('cd server && pnpm dev')).toBe(true);
    expect(ok('cd server && pnpm nope')).toBe(false);
  });
});

describe('readComposeServices', () => {
  it('returns the service names of standard YAML', () => {
    // Catches: declared services not being recognised (every compose command would be dropped).
    const yaml = ['version: "3"', 'services:', '  postgres:', '    image: pg', '  redis:', '    image: r', 'volumes:', '  data:'].join('\n');
    expect([...readComposeServices(yaml)].sort()).toEqual(['postgres', 'redis']);
  });

  it('fails closed (empty set) on flow style or tab indentation', () => {
    // Catches: guessing services from YAML it cannot parse, which would let an undeclared one through.
    expect(readComposeServices('services: { postgres: {image: pg} }').size).toBe(0);
    expect(readComposeServices('services:\n{postgres: {image: pg}}').size).toBe(0);
    expect(readComposeServices('services:\n\tpostgres:\n\t\timage: pg').size).toBe(0);
  });
});
