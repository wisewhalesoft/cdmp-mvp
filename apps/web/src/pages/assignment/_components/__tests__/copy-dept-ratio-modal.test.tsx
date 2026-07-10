import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { CopyDeptRatioModal } from '../copy-dept-ratio-modal';
import type { PersonnelRatioCopySource } from '@/api/assignment-stage';

/**
 * 個別業務比例設定頁 —「從本月其他名單複製」modal 測試。
 *
 * 行為：
 *   - open=false → 不渲染
 *   - loading → 顯示載入態
 *   - sources 為空 → 顯示空態
 *   - 列出來源名單（listNo / listNm / 人數 / 加總）
 *   - 點「使用此設定」→ onCopy(source)
 *   - 點關閉 / backdrop → onClose
 */

const sources: PersonnelRatioCopySource[] = [
  {
    listNo: 'OB202607002',
    listNm: '2026-07 名單二',
    memberCount: 2,
    deptSum: 100,
    employees: [
      { empId: 'EMP001', empName: '張三', ration: 60 },
      { empId: 'EMP002', empName: '李四', ration: 40 },
    ],
  },
];

function renderModal(props: Partial<React.ComponentProps<typeof CopyDeptRatioModal>> = {}) {
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(
    <CopyDeptRatioModal
      open
      deptCode="XTC0"
      deptName="北一處"
      loading={false}
      sources={sources}
      onCopy={onCopy}
      onClose={onClose}
      {...props}
    />,
  );
  return { onCopy, onClose };
}

describe('CopyDeptRatioModal', () => {
  afterEach(() => cleanup());

  it('open=false 時不渲染', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('copy-dept-ratio-modal-XTC0')).not.toBeInTheDocument();
  });

  it('loading 時顯示載入態', () => {
    renderModal({ loading: true, sources: [] });
    expect(screen.getByTestId('copy-dept-modal-loading')).toBeInTheDocument();
  });

  it('sources 為空時顯示空態', () => {
    renderModal({ sources: [] });
    expect(screen.getByTestId('copy-dept-modal-empty')).toBeInTheDocument();
  });

  it('列出來源名單並顯示人數與加總', () => {
    renderModal();
    expect(screen.getByTestId('copy-dept-source-OB202607002')).toBeInTheDocument();
    expect(screen.getByText('2026-07 名單二')).toBeInTheDocument();
    expect(screen.getByText(/2 位業務員/)).toBeInTheDocument();
    expect(screen.getByText(/加總 100\.00%/)).toBeInTheDocument();
  });

  it('點「使用此設定」→ onCopy(source)', () => {
    const { onCopy } = renderModal();
    fireEvent.click(screen.getByTestId('btn-use-source-OB202607002'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledWith(sources[0]);
  });

  it('點關閉按鈕 → onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('btn-close-copy-dept-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
