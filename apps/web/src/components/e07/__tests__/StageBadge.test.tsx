import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StageBadge, STAGE_ORDER } from '../StageBadge';

describe('StageBadge', () => {
  afterEach(() => cleanup());

  it('renders draft stage with gray colors', () => {
    render(<StageBadge stage="draft" />);
    const el = screen.getByTestId('stage-badge-draft');
    expect(el).toHaveTextContent('草稿');
    expect(el.className).toMatch(/bg-gray-100/);
  });

  it('renders dept_ratio stage with blue colors', () => {
    render(<StageBadge stage="dept_ratio" />);
    expect(screen.getByTestId('stage-badge-dept_ratio')).toHaveTextContent('部門比例');
  });

  it('renders personnel_ratio stage with cyan colors', () => {
    render(<StageBadge stage="personnel_ratio" />);
    expect(screen.getByTestId('stage-badge-personnel_ratio')).toHaveTextContent('個別比例');
  });

  it('renders approval stage with amber colors', () => {
    render(<StageBadge stage="approval" />);
    expect(screen.getByTestId('stage-badge-approval')).toHaveTextContent('待簽核');
  });

  it('renders ready stage with green colors', () => {
    render(<StageBadge stage="ready" />);
    expect(screen.getByTestId('stage-badge-ready')).toHaveTextContent('準備完成');
  });

  it('renders disabled stage with red colors', () => {
    render(<StageBadge stage="disabled" />);
    expect(screen.getByTestId('stage-badge-disabled')).toHaveTextContent('已停用');
  });

  it('shows count badge when withCount is provided', () => {
    render(<StageBadge stage="draft" withCount={5} />);
    expect(screen.getByTestId('stage-badge-draft')).toHaveTextContent('5');
  });

  it('STAGE_ORDER exposes 5 stages in pipeline order', () => {
    expect(STAGE_ORDER).toEqual([
      'draft',
      'dept_ratio',
      'personnel_ratio',
      'approval',
      'ready',
    ]);
  });
});

import { afterEach } from 'vitest';
