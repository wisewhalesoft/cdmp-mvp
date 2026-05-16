/**
 * F055 v1.5 frontend：CreateCardLevelModal RTL tests
 *
 * 對應 spec：docs/specs/features/F055-edit-card-level-thresholds.md v1.5
 *   - §5.4 POST /api/v1/assignment/scoring/card-levels
 *   - AC-8 ~ AC-8f
 *   - prototype 28 L1672~1797 modal 行為（auto-suggest / cardLevel 唯一大寫 / 區間驗證）
 *
 * 覆蓋：
 *   - TS-F055-M01：開啟時 CARD_TYPE disabled 顯示 'H — 期中'
 *   - TS-F055-M02：auto-suggest 空 levels → cardLevel='A' / scoreS=0 / scoreE=999
 *   - TS-F055-M03：auto-suggest 既有 levels → 下一個未使用代碼 + scoreE = lowest.scoreS - 1
 *   - TS-F055-M04：cardLevel input maxLength=1 + 自動 uppercase
 *   - TS-F055-M05：必填驗證 — scoreS / scoreE 空 → inline 錯誤，不打 API
 *   - TS-F055-M06：happy path submit → 呼叫 createCardLevel 4 欄位（無 cardVersion）+ toast
 *   - TS-F055-M07：422 CARD_LEVEL_DUPLICATE → 顯示 cardLevel inline 錯誤，modal 不關閉
 *   - TS-F055-M08：422 SCORING_RANGE_OVERLAP → 顯示分數欄位 inline 錯誤，modal 不關閉
 *   - TS-F055-M09：422 VALIDATION_ERROR → 顯示通用錯誤訊息，modal 不關閉
 *   - TS-F055-M10：409 SCORING_VERSION_LOCKED → toast + modal 關閉
 *   - TS-F055-M11：404 CARD_TYPE_NOT_FOUND → toast + modal 關閉
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { CreateCardLevelModal } from '../_components/create-card-level-modal';
import * as api from '@/api/assignment-scoring';

vi.mock('@/api/assignment-scoring', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-scoring');
  return {
    ...actual,
    createCardLevel: vi.fn(),
  };
});

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>
  );
}

const COMMON_PROPS = {
  open: true,
  cardType: 'H' as const,
  cardName: '期中',
  existingLevels: [] as Array<{ cardLevel: string; scoreS: number; scoreE: number }>,
  onClose: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateCardLevelModal — F055 v1.5', () => {
  it('TS-F055-M01：開啟時 CARD_TYPE 顯示 "H — 期中" 且 disabled', () => {
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} />));
    const input = screen.getByTestId('level-modal-card-type') as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.value).toBe('H — 期中');
  });

  it('TS-F055-M02：auto-suggest 空 levels → cardLevel="A", scoreS=0, scoreE=999', () => {
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} />));
    const cl = screen.getByTestId('level-modal-card-level') as HTMLInputElement;
    const ss = screen.getByTestId('level-modal-score-s') as HTMLInputElement;
    const se = screen.getByTestId('level-modal-score-e') as HTMLInputElement;
    expect(cl.value).toBe('A');
    expect(ss.value).toBe('0');
    expect(se.value).toBe('999');
  });

  it('TS-F055-M03：auto-suggest 既有 A(80~999) → cardLevel="B", scoreS="", scoreE=79', () => {
    render(
      wrap(
        <CreateCardLevelModal
          {...COMMON_PROPS}
          existingLevels={[{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]}
        />,
      ),
    );
    const cl = screen.getByTestId('level-modal-card-level') as HTMLInputElement;
    const ss = screen.getByTestId('level-modal-score-s') as HTMLInputElement;
    const se = screen.getByTestId('level-modal-score-e') as HTMLInputElement;
    expect(cl.value).toBe('B');
    expect(ss.value).toBe('');
    expect(se.value).toBe('79');
  });

  it('TS-F055-M04：cardLevel input maxLength=1 + 自動 uppercase', () => {
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} />));
    const cl = screen.getByTestId('level-modal-card-level') as HTMLInputElement;
    expect(cl.maxLength).toBe(1);
    fireEvent.change(cl, { target: { value: 'z' } });
    expect(cl.value).toBe('Z');
  });

  it('TS-F055-M05：scoreS / scoreE 空 → inline 錯誤，不打 API', async () => {
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} existingLevels={[{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]} />));
    // auto-suggest 下 scoreS 為空
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('level-modal-validation-error')).toBeInTheDocument();
    });
    expect(api.createCardLevel).not.toHaveBeenCalled();
  });

  it('TS-F055-M06：happy path submit → 呼叫 createCardLevel 4 欄位（無 cardVersion）', async () => {
    vi.mocked(api.createCardLevel).mockResolvedValue({
      cardType: 'H',
      cardVersion: 1,
      cardLevel: 'A',
      scoreS: 0,
      scoreE: 999,
      createdAt: '2026-05-15T08:30:00.000Z',
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} onClose={onClose} />));
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(api.createCardLevel).toHaveBeenLastCalledWith({
        cardType: 'H',
        cardLevel: 'A',
        scoreS: 0,
        scoreE: 999,
      });
    });
    // body 不含 cardVersion
    const calledWith = vi.mocked(api.createCardLevel).mock.calls[0][0] as any;
    expect(calledWith).not.toHaveProperty('cardVersion');
    // submit 成功後 modal 關閉
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('TS-F055-M07：422 CARD_LEVEL_DUPLICATE → 顯示 cardLevel inline 錯誤，modal 不關閉', async () => {
    vi.mocked(api.createCardLevel).mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'CARD_LEVEL_DUPLICATE',
          message: '等級代碼 A 已存在於選中計分版本',
        },
      },
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} onClose={onClose} />));
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('level-modal-card-level-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('level-modal-card-level-error').textContent).toMatch(
      /已存在/,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TS-F055-M08：422 SCORING_RANGE_OVERLAP → 顯示分數欄位錯誤，modal 不關閉', async () => {
    vi.mocked(api.createCardLevel).mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'SCORING_RANGE_OVERLAP',
          message: '新增等級 B 區間 85~120 與既有等級 A 區間 80~999 重疊，請調整',
        },
      },
    });
    const onClose = vi.fn();
    render(
      wrap(
        <CreateCardLevelModal
          {...COMMON_PROPS}
          existingLevels={[{ cardLevel: 'A', scoreS: 80, scoreE: 999 }]}
          onClose={onClose}
        />,
      ),
    );
    // 將 scoreS 補上以越過必填檢查
    fireEvent.change(screen.getByTestId('level-modal-score-s'), {
      target: { value: '85' },
    });
    fireEvent.change(screen.getByTestId('level-modal-score-e'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('level-modal-score-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('level-modal-score-error').textContent).toMatch(
      /重疊/,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TS-F055-M09：422 VALIDATION_ERROR → 通用錯誤訊息，modal 不關閉', async () => {
    vi.mocked(api.createCardLevel).mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'VALIDATION_ERROR',
          message: 'scoreE (50) 必須 >= scoreS (100)',
        },
      },
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} onClose={onClose} />));
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('level-modal-api-error')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TS-F055-M10：409 SCORING_VERSION_LOCKED → toast + modal 關閉', async () => {
    vi.mocked(api.createCardLevel).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'SCORING_VERSION_LOCKED',
          message: '分派執行中，無法修改計分設定',
        },
      },
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} onClose={onClose} />));
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('TS-F055-M11：404 CARD_TYPE_NOT_FOUND → toast + modal 關閉', async () => {
    vi.mocked(api.createCardLevel).mockRejectedValue({
      response: {
        status: 404,
        data: {
          error: 'CARD_TYPE_NOT_FOUND',
          message: '計分卡類型不存在或已停用',
        },
      },
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardLevelModal {...COMMON_PROPS} onClose={onClose} />));
    fireEvent.click(screen.getByTestId('level-modal-submit'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
