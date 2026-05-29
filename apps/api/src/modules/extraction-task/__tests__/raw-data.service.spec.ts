import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataSource } from 'typeorm';
import { RawDataService } from '../raw-data.service';

/** Build a RawDataService over a fake DataSource of the given driver type. */
function makeService(type: 'postgres' | 'sqlite'): RawDataService {
  const fakeDs = { options: { type } } as unknown as DataSource;
  return new RawDataService(fakeDs, null as any, null as any);
}

describe('RawDataService.formatCopyValue (COPY TEXT escaping)', () => {
  const svc = makeService('postgres');

  it('maps null and undefined to \\N', () => {
    expect(svc.formatCopyValue(null)).toBe('\\N');
    expect(svc.formatCopyValue(undefined)).toBe('\\N');
  });

  it('keeps 0 and empty string distinct from NULL', () => {
    expect(svc.formatCopyValue(0)).toBe('0');
    expect(svc.formatCopyValue('')).toBe('');
  });

  it('passes plain strings, numbers and UTF-8 through unchanged', () => {
    expect(svc.formatCopyValue('abc')).toBe('abc');
    expect(svc.formatCopyValue(123)).toBe('123');
    expect(svc.formatCopyValue('車貸')).toBe('車貸');
  });

  it('escapes backslash first, then tab / newline / CR', () => {
    expect(svc.formatCopyValue('C:\\temp')).toBe('C:\\\\temp');
    expect(svc.formatCopyValue('a\tb')).toBe('a\\tb');
    expect(svc.formatCopyValue('a\nb')).toBe('a\\nb');
    expect(svc.formatCopyValue('a\rb')).toBe('a\\rb');
    expect(svc.formatCopyValue('x\\\ty')).toBe('x\\\\\\ty');
  });

  it('renders Date as ISO and Buffer as escaped bytea hex', () => {
    expect(svc.formatCopyValue(new Date('2020-01-02T03:04:05.000Z'))).toBe(
      '2020-01-02T03:04:05.000Z',
    );
    expect(svc.formatCopyValue(Buffer.from('Hi'))).toBe('\\\\x4869');
  });
});

describe('RawDataService.supportsCopy / openCopyWriter guards', () => {
  it('supportsCopy is true for postgres, false for sqlite', () => {
    expect(makeService('postgres').supportsCopy()).toBe(true);
    expect(makeService('sqlite').supportsCopy()).toBe(false);
  });

  it('openCopyWriter rejects on a non-postgres target', async () => {
    await expect(
      makeService('sqlite').openCopyWriter('raw_deadbeef', ['a']),
    ).rejects.toThrow(/PostgreSQL/);
  });
});

// --- Integration: real COPY round-trip against dev PostgreSQL ---
// Self-skips when the dev DB is unreachable so unit runs stay green offline.
describe('RawDataService.openCopyWriter (integration: COPY round-trip)', () => {
  const TABLE = 'raw_deadbeef';
  const COLS = ['a', 'b', 'c', 'n', 'u', 'num', '_cdmp_extracted_at'];
  let ds: DataSource | null = null;
  let svc: RawDataService;

  beforeAll(async () => {
    const candidate = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'cdmp',
      password: process.env.DB_PASSWORD || 'cdmp_secret',
      database: process.env.DB_NAME || 'cdmp_dev',
    });
    try {
      await candidate.initialize();
      ds = candidate;
      svc = new RawDataService(ds, null as any, null as any);
      await ds.query(`DROP TABLE IF EXISTS "${TABLE}"`);
      await ds.query(
        `CREATE TABLE "${TABLE}" (a text, b text, c text, n text, u text, num text, _cdmp_extracted_at text)`,
      );
    } catch {
      ds = null; // unreachable → skip the test body
    }
  }, 15_000);

  afterAll(async () => {
    if (ds) {
      try { await ds.query(`DROP TABLE IF EXISTS "${TABLE}"`); } catch { /* ignore */ }
      await ds.destroy();
    }
  });

  it('round-trips tab / newline / backslash / NULL / unicode / number', async () => {
    if (!ds) {
      console.warn('[skip] dev PostgreSQL unreachable — COPY integration not run');
      return;
    }

    const writer = await svc.openCopyWriter(TABLE, COLS);
    await writer.writeRows([
      {
        a: 'tab\there',
        b: 'line\nbreak',
        c: 'C:\\temp',
        n: null,
        u: '車貸',
        num: 123,
        _cdmp_extracted_at: '2020-01-01T00:00:00.000Z',
      },
      {
        a: 'second',
        b: 'row',
        c: '',
        n: 'notnull',
        u: '中文字',
        num: 0,
        _cdmp_extracted_at: '2020-01-02T00:00:00.000Z',
      },
    ]);
    await writer.finish();

    const rows = await ds.query(`SELECT a, b, c, n, u, num FROM "${TABLE}" ORDER BY a`);
    expect(rows).toHaveLength(2);

    const [r1, r2] = rows; // 'second' < 'tab...' alphabetically
    expect(r1.a).toBe('second');
    expect(r1.c).toBe('');
    expect(r1.n).toBe('notnull');
    expect(r1.u).toBe('中文字');
    expect(r1.num).toBe('0');

    expect(r2.a).toBe('tab\there');
    expect(r2.b).toBe('line\nbreak');
    expect(r2.c).toBe('C:\\temp');
    expect(r2.n).toBeNull();
    expect(r2.u).toBe('車貸');
    expect(r2.num).toBe('123');
  }, 15_000);
});
