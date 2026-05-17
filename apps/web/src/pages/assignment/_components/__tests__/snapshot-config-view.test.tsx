import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapshotConfigView } from '../snapshot-config-view';

/**
 * F066 Snapshot config 正規化 view
 *
 * 對應 prototype 35-snapshot-detail.html L251+
 *
 * 後端 config payload 結構：
 *   { listDefinitions: [], levelcardLevels: [], tiers: [], deptPct: [], emplSet: [] }
 */

const PAYLOAD = {
  projectWorkym: '202605',
  listDefinitions: [
    { listNo: 'OB202605001', listNm: '汽車期中', cardType: 'M3', crEnabled: true, caseStatus: '01' },
  ],
  levelcardLevels: [
    { cardType: 'H', cardVersion: 3, scoreS: 80, scoreE: 100, cardLevel: 'A' },
    { cardType: 'H', cardVersion: 3, scoreS: 60, scoreE: 79, cardLevel: 'B' },
  ],
  tiers: [
    { cardType: 'H', cardLevel: 'A', tierLevel: 'T1' },
  ],
  deptPct: [
    { listNo: 'OB202605001', deptId: 'D01', ration: 60 },
    { listNo: 'OB202605001', deptId: 'D02', ration: 40 },
  ],
  emplSet: [
    { listNo: 'OB202605001', deptId: 'D01', emplid: 'E001', ration: 100 },
  ],
};

describe('SnapshotConfigView', () => {
  it('payload=null 顯示空狀態', () => {
    render(<SnapshotConfigView payload={null} />);
    expect(screen.getByTestId('snapshot-config-empty')).toBeInTheDocument();
  });

  it('渲染 listDefinitions table', () => {
    render(<SnapshotConfigView payload={PAYLOAD} />);
    const table = screen.getByTestId('snapshot-config-list-defs');
    expect(table).toBeInTheDocument();
    expect(table.textContent).toContain('OB202605001');
    expect(table.textContent).toContain('汽車期中');
  });

  it('渲染 levelcardLevels table', () => {
    render(<SnapshotConfigView payload={PAYLOAD} />);
    expect(screen.getByTestId('snapshot-config-card-levels')).toBeInTheDocument();
    const table = screen.getByTestId('snapshot-config-card-levels');
    expect(table.textContent).toContain('cardLevel');
  });

  it('渲染 tiers table', () => {
    render(<SnapshotConfigView payload={PAYLOAD} />);
    expect(screen.getByTestId('snapshot-config-tiers')).toBeInTheDocument();
  });

  it('渲染 deptPct table（per LIST_NO 分組）', () => {
    render(<SnapshotConfigView payload={PAYLOAD} />);
    expect(screen.getByTestId('snapshot-config-dept-pct')).toBeInTheDocument();
  });

  it('渲染 emplSet table', () => {
    render(<SnapshotConfigView payload={PAYLOAD} />);
    expect(screen.getByTestId('snapshot-config-empl-set')).toBeInTheDocument();
  });

  it('empty array → 區段內顯示「無紀錄」', () => {
    render(
      <SnapshotConfigView
        payload={{ projectWorkym: '202605', listDefinitions: [], levelcardLevels: [], tiers: [], deptPct: [], emplSet: [] }}
      />,
    );
    const table = screen.getByTestId('snapshot-config-list-defs');
    expect(table.textContent).toMatch(/無紀錄|無|尚無/);
  });
});
