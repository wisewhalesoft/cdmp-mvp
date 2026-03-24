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

const mockTableList: TargetTableListResponse = {
  data: [
    { tableName: 'customer_core', displayName: 'Customer Core（身分/主檔）', domain: 'core', columnCount: 16, description: '客戶基本身分與主檔資料' },
    { tableName: 'customer_interaction', displayName: 'Customer Interaction（行為/接觸）', domain: 'interaction', columnCount: 14, description: '客戶行為與接觸紀錄' },
    { tableName: 'customer_financial', displayName: 'Customer Financial（交易/風控）', domain: 'financial', columnCount: 20, description: '交易與風控資料' },
    { tableName: 'customer_service', displayName: 'Customer Service（客服/申訴）', domain: 'service', columnCount: 17, description: '客服與申訴案件' },
  ],
};

const mockCoreSchema: TargetTableSchemaResponse = {
  tableName: 'customer_core',
  displayName: 'Customer Core（身分/主檔）',
  domain: 'core',
  description: '客戶基本身分與主檔資料',
  columns: [
    { name: 'customer_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '客戶唯一識別碼' },
    { name: 'id_number', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '身分證號（加密）' },
    { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '姓名' },
    { name: 'data_source', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: true, description: '資料來源識別' },
    { name: '_etl_loaded_at', type: 'TIMESTAMP', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'ETL 載入時間（系統自動填充）' },
    { name: '_etl_pipeline_id', type: 'UUID', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'Pipeline ID（系統自動填充）' },
  ],
};

function renderPage() {
  return render(
    <BrowserRouter>
      <TargetTablesPage />
    </BrowserRouter>,
  );
}

describe('TargetTablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({ id: '1', name: 'Admin', email: 'a@b.c', role: 'admin' });
    mockedGetTargetTables.mockResolvedValue(mockTableList);
    mockedGetTargetTableSchema.mockResolvedValue(mockCoreSchema);
  });

  it('should render page title and subtitle', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('page-title')).toHaveTextContent('Domain-Oriented 目標表定義');
      expect(screen.getByTestId('page-subtitle')).toHaveTextContent(
        '系統預定義的 4 個 Domain Data Product 目標表，由 ETL Pipeline Load 節點寫入',
      );
    });
  });

  it('should render breadcrumb with ETL Pipeline > 目標表定義', async () => {
    renderPage();
    await waitFor(() => {
      const breadcrumbLinks = screen.getAllByText('ETL Pipeline');
      // At least one in breadcrumb (another in sidebar)
      expect(breadcrumbLinks.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('目標表定義')).toBeInTheDocument();
    });
  });

  it('should render 4 domain cards with correct badges and column counts', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('card-core')).toBeInTheDocument();
      expect(screen.getByTestId('card-interaction')).toBeInTheDocument();
      expect(screen.getByTestId('card-financial')).toBeInTheDocument();
      expect(screen.getByTestId('card-service')).toBeInTheDocument();
    });

    expect(screen.getByTestId('badge-core')).toHaveTextContent('core');
    expect(screen.getByTestId('badge-interaction')).toHaveTextContent('interaction');
    expect(screen.getByTestId('badge-financial')).toHaveTextContent('financial');
    expect(screen.getByTestId('badge-service')).toHaveTextContent('service');

    expect(screen.getByText('16 欄位')).toBeInTheDocument();
    expect(screen.getByText('14 欄位')).toBeInTheDocument();
    expect(screen.getByText('20 欄位')).toBeInTheDocument();
    expect(screen.getByText('17 欄位')).toBeInTheDocument();
  });

  it('should expand table on chevron click and show schema columns', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    // Table should not be visible initially
    expect(screen.queryByTestId('table-core')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByTestId('toggle-core'));

    await waitFor(() => {
      expect(screen.getByTestId('table-core')).toBeInTheDocument();
    });

    // Verify 5 column headers (PK appears in both header and row data, use getAllByText)
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

  it('should show ETL tracking rows with gray background and auto-fill label', async () => {
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

    // Check auto-fill labels
    const labels = screen.getAllByText('系統自動填充');
    expect(labels.length).toBe(3);
  });

  it('should collapse table when clicking toggle again', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('toggle-core')).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByTestId('toggle-core'));
    await waitFor(() => {
      expect(screen.getByTestId('table-core')).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByTestId('toggle-core'));
    await waitFor(() => {
      expect(screen.queryByTestId('table-core')).not.toBeInTheDocument();
    });
  });

  it('should apply correct domain badge colors', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('badge-core')).toBeInTheDocument();
    });

    expect(screen.getByTestId('badge-core').className).toContain('bg-blue-50');
    expect(screen.getByTestId('badge-core').className).toContain('text-blue-700');
    expect(screen.getByTestId('badge-interaction').className).toContain('bg-green-50');
    expect(screen.getByTestId('badge-interaction').className).toContain('text-green-700');
    expect(screen.getByTestId('badge-financial').className).toContain('bg-amber-50');
    expect(screen.getByTestId('badge-financial').className).toContain('text-amber-700');
    expect(screen.getByTestId('badge-service').className).toContain('bg-purple-50');
    expect(screen.getByTestId('badge-service').className).toContain('text-purple-700');
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
