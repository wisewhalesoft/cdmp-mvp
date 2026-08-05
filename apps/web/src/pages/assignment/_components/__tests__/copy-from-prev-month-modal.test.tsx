import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  CopyFromPrevMonthModal,
  computePrevYm,
} from '../copy-from-prev-month-modal';
import type { AssignmentListItem } from '@/api/assignment-list';
import * as pooldataFieldsApi from '@/api/pooldata-fields';
import * as cardTypeApi from '@/api/card-type';
import { __resetConditionDecoderCache } from '../../_hooks/use-condition-decoder';
import {
  DECODER_FIELDS,
  DECODER_CARD_TYPES,
  optionsResponseFor,
} from '../../_hooks/__tests__/condition-decoder-fixtures';

vi.mock('@/api/pooldata-fields', async () => {
  const actual = await vi.importActual<typeof pooldataFieldsApi>('@/api/pooldata-fields');
  return { ...actual, listFields: vi.fn(), listOptions: vi.fn() };
});
vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return { ...actual, listCardTypes: vi.fn() };
});

const mockedListFields = vi.mocked(pooldataFieldsApi.listFields);
const mockedListOptions = vi.mocked(pooldataFieldsApi.listOptions);
const mockedListCardTypes = vi.mocked(cardTypeApi.listCardTypes);

beforeEach(() => {
  __resetConditionDecoderCache();
  mockedListFields.mockResolvedValue(DECODER_FIELDS);
  mockedListOptions.mockImplementation(async (col: string) => optionsResponseFor(col));
  mockedListCardTypes.mockResolvedValue(DECODER_CARD_TYPES);
});

/**
 * F050 Phase 3 P2-6 — 從上月複製名單 modal
 *
 * 對應 prototype 27a-list-create-draft.html L130-310
 *
 * 行為：
 *   - open=false → 不渲染
 *   - 列出上月名單清單（含 listNo / listNm / prodKind / crEnabled / 條件）
 *   - 點 row「使用此名單」→ onCopy(list)
 *   - 載入中顯示 loading；空清單顯示「上月無啟用中名單」
 */

describe('computePrevYm (pure)', () => {
  it('202605 → 202604', () => {
    expect(computePrevYm('202605')).toBe('202604');
  });

  it('202601 → 202512（跨年）', () => {
    expect(computePrevYm('202601')).toBe('202512');
  });

  it('202612 → 202611', () => {
    expect(computePrevYm('202612')).toBe('202611');
  });

  it('輸入格式錯誤 → 空字串', () => {
    expect(computePrevYm('20')).toBe('');
    expect(computePrevYm('abcdef')).toBe('');
  });
});

const LISTS: AssignmentListItem[] = [
  {
    listNo: 'OB202604001',
    listNm: '汽車期中名單',
    prodKind: 'A1',
    caseYear: '3$$4',
    specTp: '01',
    caseStatus: '01',
    crEnabled: true,
    listPeriodStart: 0,
    listPeriodEnd: 999,
    listInterval: 30,
    settleSrc: 'N',
    cardType: 'M3',
    prodBest: null,
    status: 'active',
    stage: 'ready',
    createdBy: '張部長',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
  },
  {
    listNo: 'OB202604002',
    listNm: '機車期中名單',
    prodKind: 'B1',
    caseYear: '2',
    specTp: '02',
    caseStatus: '02',
    crEnabled: false,
    listPeriodStart: 0,
    listPeriodEnd: 999,
    listInterval: 30,
    settleSrc: 'N',
    cardType: 'M2',
    prodBest: null,
    status: 'active',
    stage: 'ready',
    createdBy: '張部長',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
  },
];

describe('CopyFromPrevMonthModal (component)', () => {
  it('open=false 不渲染', () => {
    const { container } = render(
      <CopyFromPrevMonthModal
        open={false}
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('open=true 渲染 modal + prev ym 顯示', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('copy-prev-month-modal')).toBeInTheDocument();
    const modal = screen.getByTestId('copy-prev-month-modal');
    expect(modal.textContent).toContain('202604');
  });

  it('列出所有上月名單', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('copy-row-OB202604001')).toBeInTheDocument();
    expect(screen.getByTestId('copy-row-OB202604002')).toBeInTheDocument();
  });

  it('點 row「使用此名單」→ onCopy 帶入該 list', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-use-OB202604001'));
    expect(onCopy).toHaveBeenCalledWith(LISTS[0]);
  });

  it('loading=true 顯示「載入中」', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={[]}
        loading
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('copy-modal-loading')).toBeInTheDocument();
  });

  it('lists=[] 顯示「上月無啟用中名單」', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={[]}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('copy-modal-empty')).toBeInTheDocument();
  });

  it('點 close 按鈕觸發 onClose', () => {
    const onClose = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-close-copy-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('row 顯示 CR 狀態（啟用/停用）', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    const row1 = screen.getByTestId('copy-row-OB202604001');
    expect(row1.textContent).toContain('CR');
  });

  it('條件摘要解碼欄位名稱與值（spec_tp 01→本牌/新車、caseYear 3$$4→3 年、4 年；未知碼 raw fallback）', async () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    // options 載入後值代碼解碼為中文
    await waitFor(() => {
      const row1 = screen.getByTestId('copy-row-OB202604001');
      expect(row1.textContent).toContain('專案類別：本牌/新車');
      expect(row1.textContent).toContain('3 年、4 年');
    });
    const row1 = screen.getByTestId('copy-row-OB202604001');
    // prod_kind 'A1' 非白名單可選值 → raw fallback（顯示原碼），不裸露欄位代碼
    expect(row1.textContent).toContain('產品類別：A1');
    expect(row1.textContent).not.toContain('prod_kind');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F118 — 從上月複製「已複製過」提示
// 對應 prototypes/27a-list-create-draft.html L1192-1295（already-copied-badge / dupConfirmModal）
// docs/specs/contracts/F118-copy-duplicate-check.contract.ts
// docs/test-specs/features/F118-test.md §四 TS-F118-FE-001~009
// ═══════════════════════════════════════════════════════════════════════════
describe('F118 — 已複製過提示（CopyFromPrevMonthModal）', () => {
  const DUPLICATE_ITEMS = [
    { listNo: 'OB202604001', alreadyCopied: true, copiedToListNo: 'OB202605003' },
    { listNo: 'OB202604002', alreadyCopied: false, copiedToListNo: null },
  ];

  it('TS-F118-FE-001：alreadyCopied=true 之候選顯示 already-copied-badge，內容含目標編號', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    const row1 = screen.getByTestId('copy-row-OB202604001');
    const badge = within(row1).getByTestId('already-copied-badge');
    expect(badge.textContent).toContain('OB202605003');
  });

  it('TS-F118-FE-002：未複製過之候選不渲染 already-copied-badge', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    const row2 = screen.getByTestId('copy-row-OB202604002');
    expect(within(row2).queryByTestId('already-copied-badge')).toBeNull();
  });

  it('TS-F118-FE-003：copy-row 帶 data-already-copied / data-copied-to-list-no 屬性', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    const row1 = screen.getByTestId('copy-row-OB202604001');
    expect(row1.getAttribute('data-already-copied')).toBe('true');
    expect(row1.getAttribute('data-copied-to-list-no')).toBe('OB202605003');
    const row2 = screen.getByTestId('copy-row-OB202604002');
    expect(row2.getAttribute('data-already-copied')).toBe('false');
  });

  it('TS-F118-FE-004：目標編號為純文字，非連結（AC-4 / D-8）', () => {
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={() => {}}
        onClose={() => {}}
      />,
    );
    const badge = screen.getByTestId('already-copied-badge');
    expect(badge.querySelector('a')).toBeNull();
    expect(badge.tagName).not.toBe('A');
  });

  it('TS-F118-FE-005（★核心）：點擊已複製過候選「使用此名單」→ 觸發二次確認彈窗，onCopy 尚未被呼叫', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-use-OB202604001'));
    expect(screen.getByTestId('dup-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('dup-confirm-target-list-no').textContent).toContain('OB202605003');
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('TS-F118-FE-006：確認彈窗按「取消」→ 彈窗關閉，onCopy 未被呼叫', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-use-OB202604001'));
    fireEvent.click(screen.getByTestId('btn-cancel-dup-copy'));
    expect(screen.queryByTestId('dup-confirm-modal')).toBeNull();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('TS-F118-FE-007：確認彈窗按「仍要以此名單為基礎建立」→ onCopy 被呼叫且帶入該 list，彈窗關閉', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-use-OB202604001'));
    fireEvent.click(screen.getByTestId('btn-confirm-dup-copy'));
    expect(onCopy).toHaveBeenCalledWith(LISTS[0]);
    expect(screen.queryByTestId('dup-confirm-modal')).toBeNull();
  });

  it('TS-F118-FE-008（回歸）：未複製過候選之「使用此名單」→ 不觸發確認彈窗，onCopy 立即被呼叫', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        duplicateItems={DUPLICATE_ITEMS as any}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-use-OB202604002'));
    expect(onCopy).toHaveBeenCalledWith(LISTS[1]);
    expect(screen.queryByTestId('dup-confirm-modal')).toBeNull();
  });

  it('TS-F118-FE-009（AC-10 降級）：duplicateItems 未傳入 → 無徽章、點擊直接 onCopy（行為與 F118 實作前相同）', () => {
    const onCopy = vi.fn();
    render(
      <CopyFromPrevMonthModal
        open
        prevYm="202604"
        lists={LISTS}
        loading={false}
        onCopy={onCopy}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('already-copied-badge')).toBeNull();
    // 即使 LISTS[0].listNo 與 DUPLICATE_ITEMS 中「應為已複製過」的 listNo 相同，
    // 未傳入 duplicateItems 時仍必須直接呼叫 onCopy（AC-10：判定資料不可得 = 全部未標示）
    fireEvent.click(screen.getByTestId('btn-use-OB202604001'));
    expect(onCopy).toHaveBeenCalledWith(LISTS[0]);
    expect(screen.queryByTestId('dup-confirm-modal')).toBeNull();
  });
});
