import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { TargetTablesPage } from '../target-tables-page';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import * as authStore from '@/stores/auth-store';
import type { TargetTableListResponse, TargetTableSchemaResponse } from '@cdmp/shared';

vi.mock('@/api/etl-pipelines');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetTargetTables = vi.mocked(etlPipelinesApi.getTargetTables);
const mockedGetTargetTableSchema = vi.mocked(etlPipelinesApi.getTargetTableSchema);
const mockedGetUser = vi.mocked(authStore.getUser);

// v2.0: Only 1 target table (customer_core), 54 columns
const mockTableList: TargetTableListResponse = {
  data: [
    {
      tableName: 'customer_core',
      displayName: 'Customer Core（客戶主檔）',
      domain: 'core',
      columnCount: 54,
      description: '客戶身分、聯絡、職業、財務概況與風控旗標',
    },
  ],
};

const mockCoreSchema: TargetTableSchemaResponse = {
  tableName: 'customer_core',
  displayName: 'Customer Core（客戶主檔）',
  domain: 'core',
  description: '客戶身分、聯絡、職業、財務概況與風控旗標',
  columns: [
    // A. 識別與分類
    { name: 'customer_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '客戶唯一識別碼（代理鍵）' },
    { name: 'source_customer_no', type: 'VARCHAR(20)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '來源客戶編號（身分證/統編）' },
    { name: 'customer_type', type: 'VARCHAR(2)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '客戶類型' },
    { name: 'name', type: 'VARCHAR(100)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '姓名/企業名稱' },
    { name: 'english_name', type: 'VARCHAR(60)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '英文姓名' },
    // B. representative
    { name: 'gender', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '性別' },
    // C. representative
    { name: 'mobile_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行動電話' },
    // H. ETL tracking
    { name: 'data_source', type: 'VARCHAR(50)', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: '資料來源識別（ETL 自動填充）' },
    { name: '_etl_loaded_at', type: 'TIMESTAMP', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'ETL 載入時間（系統自動填充）' },
    { name: '_etl_pipeline_id', type: 'UUID', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: '載入的 Pipeline ID（系統自動填充）' },
  ],
};

function renderPage() {
  return render(
    <BrowserRouter>
      <TargetTablesPage />
    </BrowserRouter>,
  );
}

describe('TargetTablesPage (v2.0 — 1 table)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({ id: '1', name: 'Admin', email: 'a@b.c', role: 'admin' });
    mockedGetTargetTables.mockResolvedValue(mockTableList);
    mockedGetTargetTableSchema.mockResolvedValue(mockCoreSchema);
  });

  it('should render page title and subtitle (Phase 1 MVP: 1 table)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('page-title')).toHaveTextContent('Domain-Oriented 目標表定義');
      expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
        'Phase 1 MVP 預定義 1 個 Domain Data Product 目標表，由 ETL Pipeline Load 節點寫入',
      );
    });
  });

  it('should render breadcrumb with ETL Pipeline > 目標表定義', async () => {
    renderPage();
    await waitFor(() => {
      const breadcrumbLinks = screen.getAllByText('ETL Pipeline');
      expect(breadcrumbLinks.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('目標表定義')).toBeInTheDocument();
    });
  });

  it('should render 1 domain card (customer_core) with correct badge and column count', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('card-core')).toBeInTheDocument();
    });

    // Only core exists
    expect(screen.queryByTestId('card-interaction')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-financial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-service')).not.toBeInTheDocument();

    expect(screen.getByTestId('badge-core')).toHaveTextContent('core');
    expect(screen.getByText('54 欄位')).toBeInTheDocument();
  });

  it('should expand table on chevron click and show schema columns', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('table-core')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-core'));

    await waitFor(() => {
      expect(screen.getByTestId('table-core')).toBeInTheDocument();
    });

    expect(screen.getByText('欄位名稱')).toBeInTheDocument();
    expect(screen.getByText('型別')).toBeInTheDocument();
    expect(screen.getByText('Nullable')).toBeInTheDocument();
    const pkElements = screen.getAllByText('PK');
    expect(pkElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('說明')).toBeInTheDocument();
  });

  it('should show PK marker with red * prefix and PK label', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toggle-core'));

    await waitFor(() => {
      expect(screen.getByTestId('row-customer_id')).toBeInTheDocument();
    });

    const pkRow = screen.getByTestId('row-customer_id');
    expect(pkRow).toHaveTextContent('*');
    expect(pkRow).toHaveTextContent('PK');
  });

  it('should show ETL tracking rows with auto-fill label', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toggle-core'));

    await waitFor(() => {
      expect(screen.getByTestId('etl-tracking-row-data_source')).toBeInTheDocument();
      expect(screen.getByTestId('etl-tracking-row-_etl_loaded_at')).toBeInTheDocument();
      expect(screen.getByTestId('etl-tracking-row-_etl_pipeline_id')).toBeInTheDocument();
    });

    const labels = screen.getAllByText('系統自動填充');
    expect(labels.length).toBe(3);
  });

  it('should collapse table when clicking toggle again', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toggle-core'));
    await waitFor(() => {
      expect(screen.getByTestId('table-core')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toggle-core'));
    await waitFor(() => {
      expect(screen.queryByTestId('table-core')).not.toBeInTheDocument();
    });
  });

  it('should apply correct domain badge color (blue for core)', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('badge-core')).toBeInTheDocument();
    });

    expect(screen.getByTestId('badge-core').className).toContain('bg-blue-50');
    expect(screen.getByTestId('badge-core').className).toContain('text-blue-700');
  });

  it('should rotate chevron 180 degrees when expanded', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('chevron-core')).toBeInTheDocument();
    });

    const chevron = screen.getByTestId('chevron-core');
    expect(chevron.getAttribute('class')).not.toContain('rotate-180');

    await user.click(screen.getByTestId('toggle-core'));

    await waitFor(() => {
      expect(chevron.getAttribute('class')).toContain('rotate-180');
    });
  });
});
