import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WritebackModal } from '../writeback-modal';
import * as runApi from '@/api/assignment-run';

vi.mock('@/api/assignment-run');

const mockedPreview = vi.mocked(runApi.previewWriteback);
const mockedExecute = vi.mocked(runApi.executeWriteback);

function preview(overrides: Partial<runApi.WritebackPreviewResponse> = {}) {
  return {
    runId: 'R001',
    totalToWrite: 9120,
    byListNo: [
      { listNo: 'OB1', count: 5000 },
      { listNo: 'OB2', count: 4120 },
    ],
    sample: [],
    notMatched: null,
    connectionAvailable: true,
    ...overrides,
  } as runApi.WritebackPreviewResponse;
}

describe('WritebackModal (F115)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('開啟即載入 preview 並顯示將更新筆數', async () => {
    mockedPreview.mockResolvedValue(preview());
    render(<WritebackModal runId="R001" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('writeback-preview-total')).toHaveTextContent('9,120'),
    );
    expect(mockedPreview).toHaveBeenCalledWith('R001');
  });

  it('確認前「確認回寫」為 disabled；勾選後啟用並可執行', async () => {
    mockedPreview.mockResolvedValue(preview());
    mockedExecute.mockResolvedValue({
      runId: 'R001',
      updated: 9100,
      notMatched: 20,
      byListNo: [],
    });
    render(<WritebackModal runId="R001" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('writeback-preview-total')).toBeInTheDocument());

    expect(screen.getByTestId('writeback-execute-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('writeback-confirm-checkbox'));
    expect(screen.getByTestId('writeback-execute-btn')).toBeEnabled();

    fireEvent.click(screen.getByTestId('writeback-execute-btn'));
    await waitFor(() => expect(mockedExecute).toHaveBeenCalledWith('R001'));
    await waitFor(() =>
      expect(screen.getByTestId('writeback-result')).toHaveTextContent(/9,100/),
    );
  });

  it('外部連線未就緒 → 顯示警告且確認框停用', async () => {
    mockedPreview.mockResolvedValue(preview({ connectionAvailable: false }));
    render(<WritebackModal runId="R001" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('writeback-conn-warning')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('writeback-confirm-checkbox')).toBeDisabled();
    expect(screen.getByTestId('writeback-execute-btn')).toBeDisabled();
  });

  it('execute 失敗顯示錯誤（如連線未設定）', async () => {
    mockedPreview.mockResolvedValue(preview());
    mockedExecute.mockRejectedValue({
      response: { data: { message: '尚未設定或無法連線電銷系統（APYHFC16.OB）' } },
    });
    render(<WritebackModal runId="R001" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('writeback-preview-total')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('writeback-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('writeback-execute-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('writeback-error')).toHaveTextContent(/無法連線電銷系統/),
    );
  });
});
