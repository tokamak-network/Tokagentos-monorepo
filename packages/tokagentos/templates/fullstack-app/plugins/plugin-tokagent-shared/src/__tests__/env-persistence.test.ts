import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { persistVaultAddress, upsertEnvLine } from '../env-persistence.js';

// A throwaway address — content doesn't matter; only the persistence
// behaviour does.
const TEST_VAULT = '0x9796aECE92498649377888bc94372cca312222ee';
const TEST_CHAIN_ID = 999;
const EXPECTED_KEY = `TOKAGENT_VAULT_ADDRESS_${TEST_CHAIN_ID}`;

describe('env-persistence', () => {
  describe('upsertEnvLine (pure)', () => {
    it('appends a new line when the key is absent and preserves other lines', () => {
      const before = 'OPENAI_API_KEY=sk-abc\n# comment line\nOTHER=value\n';
      const after = upsertEnvLine(before, 'TOKAGENT_VAULT_ADDRESS_999', TEST_VAULT);
      expect(after).toContain('OPENAI_API_KEY=sk-abc');
      expect(after).toContain('# comment line');
      expect(after).toContain('OTHER=value');
      expect(after).toMatch(new RegExp(`TOKAGENT_VAULT_ADDRESS_999=${TEST_VAULT}\\n$`));
    });

    it('replaces an existing key value in-place and preserves surrounding lines', () => {
      const before = [
        '# header comment',
        'A=1',
        'TOKAGENT_VAULT_ADDRESS_999=0xdead',
        'B=2',
        '',
      ].join('\n');
      const after = upsertEnvLine(before, 'TOKAGENT_VAULT_ADDRESS_999', TEST_VAULT);
      const lines = after.split('\n');
      // Order preserved: header, A, key, B
      expect(lines[0]).toBe('# header comment');
      expect(lines[1]).toBe('A=1');
      expect(lines[2]).toBe(`TOKAGENT_VAULT_ADDRESS_999=${TEST_VAULT}`);
      expect(lines[3]).toBe('B=2');
      // Only one entry for the key — no duplicate appended.
      const matches = after.match(/TOKAGENT_VAULT_ADDRESS_999=/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('does not match keys that are merely a prefix of another key', () => {
      const before = 'TOKAGENT_VAULT_ADDRESS_999_LEGACY=0xold\n';
      const after = upsertEnvLine(before, 'TOKAGENT_VAULT_ADDRESS_999', TEST_VAULT);
      expect(after).toContain('TOKAGENT_VAULT_ADDRESS_999_LEGACY=0xold');
      expect(after).toContain(`TOKAGENT_VAULT_ADDRESS_999=${TEST_VAULT}`);
    });
  });

  describe('persistVaultAddress (disk)', () => {
    let tmpDir: string;
    let envPath: string;
    let savedDotenvPath: string | undefined;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokagent-env-test-'));
      envPath = path.join(tmpDir, '.env');
      savedDotenvPath = process.env.DOTENV_PATH;
      process.env.DOTENV_PATH = envPath;
    });

    afterEach(() => {
      if (savedDotenvPath === undefined) delete process.env.DOTENV_PATH;
      else process.env.DOTENV_PATH = savedDotenvPath;
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    });

    it('creates the .env file with the line when missing', async () => {
      expect(fs.existsSync(envPath)).toBe(false);
      const setSetting = vi.fn().mockResolvedValue(undefined);
      const runtime = {
        getSetting: () => undefined,
        setSetting,
      };

      await persistVaultAddress(runtime, TEST_CHAIN_ID, TEST_VAULT);

      expect(fs.existsSync(envPath)).toBe(true);
      const content = fs.readFileSync(envPath, 'utf8');
      expect(content).toContain(`${EXPECTED_KEY}=${TEST_VAULT}`);
      expect(setSetting).toHaveBeenCalledWith(EXPECTED_KEY, TEST_VAULT);
    });

    it('appends the line when the key is absent and preserves other lines', async () => {
      const original = 'OPENAI_API_KEY=sk-abc\n# user comment\nFOO=bar\n';
      fs.writeFileSync(envPath, original, 'utf8');

      const runtime = {
        getSetting: () => undefined,
        setSetting: () => Promise.resolve(),
      };
      await persistVaultAddress(runtime, TEST_CHAIN_ID, TEST_VAULT);

      const content = fs.readFileSync(envPath, 'utf8');
      expect(content).toContain('OPENAI_API_KEY=sk-abc');
      expect(content).toContain('# user comment');
      expect(content).toContain('FOO=bar');
      expect(content).toContain(`${EXPECTED_KEY}=${TEST_VAULT}`);
      // No duplicate
      const matches = content.match(new RegExp(`${EXPECTED_KEY}=`, 'g')) ?? [];
      expect(matches.length).toBe(1);
    });

    it('replaces the value in-place when the key is already present', async () => {
      const original = [
        '# header',
        'OPENAI_API_KEY=sk-abc',
        `${EXPECTED_KEY}=0x0000000000000000000000000000000000000001`,
        'OTHER=value',
        '',
      ].join('\n');
      fs.writeFileSync(envPath, original, 'utf8');

      const runtime = {
        getSetting: () => undefined,
        setSetting: () => Promise.resolve(),
      };
      await persistVaultAddress(runtime, TEST_CHAIN_ID, TEST_VAULT);

      const content = fs.readFileSync(envPath, 'utf8');
      expect(content).toContain('# header');
      expect(content).toContain('OPENAI_API_KEY=sk-abc');
      expect(content).toContain('OTHER=value');
      expect(content).toContain(`${EXPECTED_KEY}=${TEST_VAULT}`);
      // Old value removed; key appears exactly once.
      expect(content).not.toContain('0x0000000000000000000000000000000000000001');
      const matches = content.match(new RegExp(`${EXPECTED_KEY}=`, 'g')) ?? [];
      expect(matches.length).toBe(1);
    });

    it('does not throw when the disk write fails (read-only target)', async () => {
      // Point at a path under a non-existent directory we cannot create
      // through normal means — this triggers a write error.
      process.env.DOTENV_PATH = path.join(tmpDir, 'nope', 'deeper', '.env');
      // Make the parent unwritable on platforms that honour it; on Windows
      // this may be a no-op, but the missing intermediate directory still
      // makes writeFileSync throw.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const runtime = {
        getSetting: () => undefined,
        setSetting: () => Promise.resolve(),
      };

      await expect(
        persistVaultAddress(runtime, TEST_CHAIN_ID, TEST_VAULT),
      ).resolves.toBeUndefined();

      // The warn is the contract: failures are logged, never thrown.
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('still runs when the runtime has no setSetting (read-only adapter)', async () => {
      const runtime = { getSetting: () => undefined };
      await persistVaultAddress(runtime, TEST_CHAIN_ID, TEST_VAULT);
      const content = fs.readFileSync(envPath, 'utf8');
      expect(content).toContain(`${EXPECTED_KEY}=${TEST_VAULT}`);
    });
  });
});
