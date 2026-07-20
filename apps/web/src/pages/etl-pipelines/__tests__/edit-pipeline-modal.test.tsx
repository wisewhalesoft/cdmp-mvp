import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditPipelineModal } from '../edit-pipeline-modal';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { PipelineListItem } from '@cdmp/shared';

vi.mock('@/api/etl-pipelines');

const mockedUpdatePipeline = vi.mocked(etlPipelinesApi.updatePipeline);

function makePipeline(overrides: Partial<PipelineListItem> = {}): PipelineListItem {
  return {
    id: 'pl-1',
    name: 'Pipeline A',
    description: 'desc A',
    version: 2,
    stepCount: 5,
    status: 'active',
    enabled: true,
    schedule: '0 2 * * *',
    lastExecutionAt: null,
    nextExecutionAt: null,
    processedCount: 0,
    createdBy: 'Admin User',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof EditPipelineModal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const pipeline = props.pipeline ?? makePipeline();
  const open = props.open ?? true;
  const utils = render(
    <EditPipelineModal open={open} pipeline={pipeline} onClose={onClose} onSuccess={onSuccess} />,
  );
  return { ...utils, onClose, onSuccess, pipeline };
}

describe('EditPipelineModal (F093)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TS-F093-FE-003: Modal 開啟，標題正確
  it('TS-F093-FE-003: renders modal with title 編輯 Pipeline', () => {
    renderModal();
    const modal = screen.getByTestId('edit-pipeline-modal');
    expect(modal).toBeDefined();
    expect(modal.textContent).toContain('編輯 Pipeline');
  });

  it('renders nothing when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('edit-pipeline-modal')).toBeNull();
  });

  // TS-F093-FE-004: Modal 預填名稱與描述
  it('TS-F093-FE-004: pre-fills name and description', () => {
    renderModal({ pipeline: makePipeline({ name: 'Pipeline A', description: 'desc A' }) });
    const nameInput = screen.getByTestId('pipeline-name-input') as HTMLInputElement;
    const descInput = screen.getByTestId('pipeline-description-input') as HTMLTextAreaElement;
    expect(nameInput.value).toBe('Pipeline A');
    expect(descInput.value).toBe('desc A');
  });

  // TS-F093-FE-005: Modal 預填排程（每日 02:00）
  it('TS-F093-FE-005: pre-fills schedule from a daily cron', () => {
    renderModal({ pipeline: makePipeline({ schedule: '0 2 * * *' }) });
    const freq = screen.getByTestId('schedule-frequency-select') as HTMLSelectElement;
    expect(freq.value).toBe('daily');
    const hour = screen.getByTestId('schedule-hour-input') as HTMLInputElement;
    const minute = screen.getByTestId('schedule-minute-input') as HTMLInputElement;
    expect(Number(hour.value)).toBe(2);
    expect(Number(minute.value)).toBe(0);
    const preview = screen.getByTestId('schedule-preview');
    expect(preview.textContent).toContain('每日 02:00 (UTC+8)');
    expect(preview.textContent).toContain('0 2 * * *');
  });

  // TS-F093-FE-006: Modal 預填排程（schedule=null → 不設定排程）
  it('TS-F093-FE-006: schedule=null maps to no schedule', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    const freq = screen.getByTestId('schedule-frequency-select') as HTMLSelectElement;
    expect(freq.value).toBe('none');
    expect(screen.queryByTestId('schedule-preview')).toBeNull();
  });

  it('pre-fills an unknown cron shape into manual cron mode', () => {
    renderModal({ pipeline: makePipeline({ schedule: '*/15 8-18 * * 1-5' }) });
    const manual = screen.getByTestId('manual-cron-input') as HTMLInputElement;
    expect(manual.value).toBe('*/15 8-18 * * 1-5');
  });

  // TS-F093-FE-007: cron builder — 每日 02:00 產生正確 cron
  it('TS-F093-FE-007: builds daily cron 0 2 * * *', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    const freq = screen.getByTestId('schedule-frequency-select') as HTMLSelectElement;
    fireEvent.change(freq, { target: { value: 'daily' } });
    fireEvent.change(screen.getByTestId('schedule-hour-input'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('schedule-minute-input'), { target: { value: '0' } });
    const preview = screen.getByTestId('schedule-preview');
    expect(preview.textContent).toContain('0 2 * * *');
    expect(preview.textContent).toContain('每日 02:00 (UTC+8)');
  });

  // TS-F093-FE-008: cron builder — 每小時第 30 分
  it('TS-F093-FE-008: builds hourly cron 30 * * * *', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    fireEvent.change(screen.getByTestId('schedule-frequency-select'), { target: { value: 'hourly' } });
    fireEvent.change(screen.getByTestId('schedule-minute-input'), { target: { value: '30' } });
    expect(screen.getByTestId('schedule-preview').textContent).toContain('30 * * * *');
  });

  // TS-F093-FE-009: cron builder — 每週一 09:00
  it('TS-F093-FE-009: builds weekly cron 0 9 * * 1', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    fireEvent.change(screen.getByTestId('schedule-frequency-select'), { target: { value: 'weekly' } });
    fireEvent.change(screen.getByTestId('schedule-weekday-select'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('schedule-hour-input'), { target: { value: '9' } });
    fireEvent.change(screen.getByTestId('schedule-minute-input'), { target: { value: '0' } });
    expect(screen.getByTestId('schedule-preview').textContent).toContain('0 9 * * 1');
  });

  // TS-F093-FE-010: cron builder — 每月 15 日 00:00
  it('TS-F093-FE-010: builds monthly cron 0 0 15 * *', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    fireEvent.change(screen.getByTestId('schedule-frequency-select'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByTestId('schedule-day-input'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('schedule-hour-input'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('schedule-minute-input'), { target: { value: '0' } });
    expect(screen.getByTestId('schedule-preview').textContent).toContain('0 0 15 * *');
  });

  // TS-F093-FE-011: 手動 cron 模式切換
  it('TS-F093-FE-011: manual cron toggle shows manual input and preview', () => {
    renderModal({ pipeline: makePipeline({ schedule: null }) });
    const freq = screen.getByTestId('schedule-frequency-select') as HTMLSelectElement;
    fireEvent.change(freq, { target: { value: '__manual__' } });
    const manual = screen.getByTestId('manual-cron-input') as HTMLInputElement;
    expect(manual).toBeDefined();
    fireEvent.change(manual, { target: { value: '5 4 * * 0' } });
    expect(screen.getByTestId('schedule-preview').textContent).toContain('5 4 * * 0');
  });

  // TS-F093-FE-012: 不設定排程 → 送出 schedule=null
  it('TS-F093-FE-012: submits schedule=null when frequency is none', async () => {
    mockedUpdatePipeline.mockResolvedValue({
      id: 'pl-1',
      name: 'Pipeline A',
      description: 'desc A',
      status: 'active',
      enabled: true,
      schedule: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { onSuccess } = renderModal({ pipeline: makePipeline({ schedule: null }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(mockedUpdatePipeline).toHaveBeenCalledWith(
        'pl-1',
        expect.objectContaining({ schedule: null }),
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  // TS-F093-FE-013: 儲存按鈕在名稱為空時 disabled
  it('TS-F093-FE-013: save button disabled when name is blank', async () => {
    renderModal();
    const nameInput = screen.getByTestId('pipeline-name-input');
    fireEvent.change(nameInput, { target: { value: '' } });
    const saveBtn = screen.getByTestId('edit-pipeline-submit') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(mockedUpdatePipeline).not.toHaveBeenCalled();
  });

  // TS-F093-FE-014: 儲存成功 → close + onSuccess
  it('TS-F093-FE-014: successful save closes modal and triggers onSuccess', async () => {
    mockedUpdatePipeline.mockResolvedValue({
      id: 'pl-1',
      name: '已更新',
      description: 'desc A',
      status: 'active',
      enabled: true,
      schedule: '0 2 * * *',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { onClose, onSuccess } = renderModal();

    fireEvent.change(screen.getByTestId('pipeline-name-input'), { target: { value: '已更新' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(mockedUpdatePipeline).toHaveBeenCalledWith(
        'pl-1',
        expect.objectContaining({ name: '已更新' }),
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  // TS-F093-FE-015: PIPELINE_NAME_EXISTS → 內嵌錯誤訊息
  it('TS-F093-FE-015: maps PIPELINE_NAME_EXISTS to inline error and keeps modal open', async () => {
    mockedUpdatePipeline.mockRejectedValue({
      response: { status: 409, data: { error: 'PIPELINE_NAME_EXISTS' } },
    });
    const { onClose } = renderModal();

    fireEvent.change(screen.getByTestId('pipeline-name-input'), { target: { value: '重複' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('此名稱的 Pipeline 已存在')).toBeDefined();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('edit-pipeline-modal')).toBeDefined();
  });

  // TS-F093-FE-016: VALIDATION_INVALID_CRON → cron 格式錯誤訊息
  it('TS-F093-FE-016: maps VALIDATION_INVALID_CRON to cron error message', async () => {
    mockedUpdatePipeline.mockRejectedValue({
      response: { status: 422, data: { error: 'VALIDATION_INVALID_CRON' } },
    });
    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('排程格式不正確，請輸入合法的 cron 表達式')).toBeDefined();
    });
  });

  // PIPELINE_RUNNING → 適當訊息
  it('maps PIPELINE_RUNNING to a running error message', async () => {
    mockedUpdatePipeline.mockRejectedValue({
      response: { status: 409, data: { error: 'PIPELINE_RUNNING' } },
    });
    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText(/執行中/)).toBeDefined();
    });
  });

  // TS-F093-FE-017: 其他 422 → 通用錯誤訊息（message）
  it('TS-F093-FE-017: maps generic 422 to its message', async () => {
    mockedUpdatePipeline.mockRejectedValue({
      response: { status: 422, data: { error: 'VALIDATION_ERROR', message: '欄位驗證失敗' } },
    });
    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('欄位驗證失敗')).toBeDefined();
    });
  });

  // TS-F093-FE-018: 500 → 通用系統錯誤訊息
  it('TS-F093-FE-018: maps 500 to a generic system error message', async () => {
    mockedUpdatePipeline.mockRejectedValue({
      response: { status: 500, data: {} },
    });
    renderModal();

    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-pipeline-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('系統發生非預期錯誤，請稍後再試')).toBeDefined();
    });
  });

  // TS-F093-FE-019: 取消按鈕關閉 Modal 且不呼叫 API
  it('TS-F093-FE-019: cancel closes modal without calling API', async () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByTestId('pipeline-name-input'), { target: { value: '改了但不存' } });

    const cancelBtn = Array.from(
      screen.getByTestId('edit-pipeline-modal').querySelectorAll('button'),
    ).find((b) => b.textContent === '取消')!;
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(onClose).toHaveBeenCalled();
    expect(mockedUpdatePipeline).not.toHaveBeenCalled();
  });

  // TS-F093-FE-020: Backdrop 點擊關閉 Modal 且不呼叫 API
  it('TS-F093-FE-020: backdrop click closes modal without calling API', async () => {
    const { onClose } = renderModal();
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-backdrop'));
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedUpdatePipeline).not.toHaveBeenCalled();
  });
});
