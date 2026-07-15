import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertiesPanel } from '../properties-panel';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { TargetTableListResponse, TargetTableSchemaResponse } from '@cdmp/shared';
import type { Node } from '@xyflow/react';

vi.mock('@/api/etl-pipelines');

const mockedGetTargetTables = vi.mocked(etlPipelinesApi.getTargetTables);
const mockedGetTargetTableSchema = vi.mocked(etlPipelinesApi.getTargetTableSchema);
const mockedGetRawTableColumns = vi.mocked(etlPipelinesApi.getRawTableColumns);

// v2.0: Only 1 target table
const mockTableList: TargetTableListResponse = {
  data: [
    {
      tableName: 'customer_core',
      displayName: 'Customer Core（客戶主檔）',
      domain: 'core',
      columnCount: 79,
      description: '客戶身分、聯絡、職業、財務概況與風控旗標',
    },
  ],
};

// Full 79-column schema matching backend target-table-schemas.ts
const mockCoreSchema: TargetTableSchemaResponse = {
  tableName: 'customer_core',
  displayName: 'Customer Core（客戶主檔）',
  domain: 'core',
  description: '客戶身分、聯絡、職業、財務概況與風控旗標',
  columns: [
    // A. 識別與分類 (5)
    { name: 'customer_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, category: 'A', description: '客戶唯一識別碼（代理鍵）' },
    { name: 'source_customer_no', type: 'VARCHAR(20)', nullable: false, isPrimaryKey: false, isEtlTracking: false, category: 'A', description: '來源客戶編號（身分證/統編）' },
    { name: 'customer_type', type: 'VARCHAR(2)', nullable: false, isPrimaryKey: false, isEtlTracking: false, category: 'A', description: '客戶類型（01=個人/02=企業/04=外籍）' },
    { name: 'name', type: 'VARCHAR(100)', nullable: false, isPrimaryKey: false, isEtlTracking: false, category: 'A', description: '姓名/企業名稱' },
    { name: 'english_name', type: 'VARCHAR(60)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'A', description: '英文姓名' },
    // B. 個人屬性 (12)
    { name: 'gender', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '性別' },
    { name: 'date_of_birth', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '生日' },
    { name: 'marital_status', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '婚姻狀態' },
    { name: 'education_code', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '學歷代碼' },
    { name: 'education_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '學歷描述' },
    { name: 'spouse_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '配偶姓名' },
    { name: 'father_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '父親姓名' },
    { name: 'mother_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '母親姓名' },
    { name: 'id_issue_type', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '發證類別' },
    { name: 'id_issue_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '發證日期' },
    { name: 'id_issue_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '發證地址' },
    { name: 'driver_license', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'B', description: '駕照號碼' },
    // C. 聯絡資訊 (10)
    { name: 'mobile_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '行動電話' },
    { name: 'home_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '戶籍電話' },
    { name: 'contact_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '通訊電話' },
    { name: 'office_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '公司電話' },
    { name: 'registered_phone', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '公司登記電話' },
    { name: 'registered_fax', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '公司傳真' },
    { name: 'business_fax', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '營業傳真' },
    { name: 'business_mobile', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: '營業行動電話' },
    { name: 'email', type: 'VARCHAR(40)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: 'Email' },
    { name: 'line_account', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'C', description: 'Line 帳號' },
    // D. 地址 (10)
    { name: 'residential_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '戶籍郵遞區號' },
    { name: 'residential_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '戶籍地址' },
    { name: 'mailing_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '通訊郵遞區號' },
    { name: 'mailing_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '通訊地址' },
    { name: 'registered_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '公司登記郵遞區號' },
    { name: 'registered_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '公司登記地址' },
    { name: 'company_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '營業地址郵遞區號' },
    { name: 'company_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '營業地址' },
    { name: 'maturity_mailing_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '滿期寄送郵遞區號' },
    { name: 'maturity_mailing_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'D', description: '滿期寄送地址' },
    // E. 職業與就業 (12)
    { name: 'company_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '服務公司/企業名稱' },
    { name: 'role_code', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '客戶角色代碼' },
    { name: 'role_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '客戶角色描述' },
    { name: 'occupation_code', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '職業代碼' },
    { name: 'occupation_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '職業描述' },
    { name: 'job_title_code', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '職稱代碼' },
    { name: 'job_title_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '職稱描述' },
    { name: 'job_level', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '職級' },
    { name: 'industry_code', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '行業代碼' },
    { name: 'industry_desc', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '行業描述' },
    { name: 'work_years', type: 'DECIMAL(8,2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '年資' },
    { name: 'company_scale', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'E', description: '公司規模（1:>=1000萬or公教/2:<1000萬/3:其他）' },
    // F. 財務與風控 (12)
    { name: 'monthly_income', type: 'DECIMAL(8,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '月所得' },
    { name: 'approved_income', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '認定月收入' },
    { name: 'income_source', type: 'VARCHAR(5)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '收入來源代碼' },
    { name: 'capital', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '實收資本額' },
    { name: 'credit_limit', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '額度總額' },
    { name: 'highest_transaction_amount', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '最高往來金額' },
    { name: 'highest_transaction_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '最高往來日期' },
    { name: 'has_real_estate', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '自有不動產' },
    { name: 'debt_flag', type: 'CHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '消債旗標' },
    { name: 'fine_flag', type: 'CHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '違規欠稅旗標（>2萬）' },
    { name: 'address_anomaly_flag', type: 'SMALLINT', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '地址異常註記' },
    { name: 'mainland_flag', type: 'SMALLINT', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'F', description: '大陸籍旗標' },
    // G. 企業客戶專屬 (13)
    { name: 'owner_name', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '負責人姓名' },
    { name: 'owner_id', type: 'VARCHAR(10)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '負責人身分證字號' },
    { name: 'owner_birth', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '負責人生日' },
    { name: 'owner_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '負責人郵遞區號' },
    { name: 'owner_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '負責人地址' },
    { name: 'group_owner', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '集團實際負責人' },
    { name: 'established_capital', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '登記資本額' },
    { name: 'employee_count', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '員工人數' },
    { name: 'is_listed', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '上市櫃' },
    { name: 'company_attr_code', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '公司屬性' },
    { name: 'organization_type', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '組織形態' },
    { name: 'parent_customer_id', type: 'VARCHAR(10)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '母公司編號' },
    { name: 'parent_customer_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'G', description: '母公司名稱' },
    // H. 稽核與 ETL 追蹤 (5)
    { name: 'source_created_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'H', description: '來源建檔日期' },
    { name: 'source_updated_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, category: 'H', description: '來源最後更新' },
    { name: 'data_source', type: 'VARCHAR(50)', nullable: false, isPrimaryKey: false, isEtlTracking: true, category: 'H', description: '資料來源識別（ETL 自動填充）' },
    { name: '_etl_loaded_at', type: 'TIMESTAMP', nullable: false, isPrimaryKey: false, isEtlTracking: true, category: 'H', description: 'ETL 載入時間（系統自動填充）' },
    { name: '_etl_pipeline_id', type: 'UUID', nullable: false, isPrimaryKey: false, isEtlTracking: true, category: 'H', description: '載入的 Pipeline ID（系統自動填充）' },
  ],
};

const extractNode: Node = {
  id: 'extract-1',
  type: 'custom',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'raw_data_extract',
    label: 'Extract',
    rawTable: 'raw_zzip_bamcust_m',
  },
};

const mockSourceColumns = [
  'CUSTO_NO', 'CUSTOM_MK', 'CUS_NAME', 'ENG_NAME', 'CUS_SEX',
  'BITBE_DATE', 'CMARRY_MK', 'EDUCAT_BACK', 'CELLULAR', 'E_MAIL',
];

function createLoadNode(overrides?: Record<string, unknown>): Node {
  return {
    id: 'node-1',
    type: 'custom',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'target_load',
      label: 'Load',
      ...overrides,
    },
  };
}

function renderLoadProperties(nodeOverrides?: Record<string, unknown>) {
  const selectedNode = createLoadNode(nodeOverrides);
  const onNodeDataChange = vi.fn();
  const onDeleteNode = vi.fn();
  const edge = { id: 'e1', source: 'extract-1', target: 'node-1' } as any;

  return {
    ...render(
      <PropertiesPanel
        selectedNode={selectedNode}
        rawTables={[]}
        nodes={[extractNode, selectedNode]}
        edges={[edge]}
        onNodeDataChange={onNodeDataChange}
        onDeleteNode={onDeleteNode}
      />,
    ),
    onNodeDataChange,
  };
}

describe('LoadProperties (via PropertiesPanel)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTargetTables.mockResolvedValue(mockTableList);
    mockedGetTargetTableSchema.mockResolvedValue(mockCoreSchema);
    mockedGetRawTableColumns.mockResolvedValue({ data: mockSourceColumns });
  });

  it('TS-F036-030: target table select should show 1 option (customer_core)', async () => {
    renderLoadProperties();

    await waitFor(() => {
      const select = screen.getByTestId('load-target-table-select');
      expect(select).toBeInTheDocument();
    });

    const select = screen.getByTestId('load-target-table-select') as HTMLSelectElement;
    // Options: 1 placeholder + 1 real = 2
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('選擇目標表');
    expect(options[1].textContent).toContain('Customer Core');

    // Phase 2/3 tables should NOT appear
    const allText = Array.from(options).map((o) => o.textContent).join('');
    expect(allText).not.toContain('Interaction');
    expect(allText).not.toContain('Financial');
    expect(allText).not.toContain('Service');
  });

  it('TS-F036-031: selecting table auto-loads field mapping', async () => {
    const user = userEvent.setup();
    const { onNodeDataChange } = renderLoadProperties();

    await waitFor(() => {
      expect(screen.getByTestId('load-target-table-select')).toBeInTheDocument();
    });

    // Wait for options to load
    await waitFor(() => {
      const select = screen.getByTestId('load-target-table-select') as HTMLSelectElement;
      expect(select.querySelectorAll('option').length).toBe(2);
    });

    // Select customer_core
    await user.selectOptions(screen.getByTestId('load-target-table-select'), 'customer_core');

    expect(onNodeDataChange).toHaveBeenCalledWith('node-1', expect.objectContaining({
      targetTable: 'customer_core',
    }));
  });

  it('TS-F036-032: ETL tracking fields show lock icon and auto-fill label', async () => {
    renderLoadProperties({ targetTable: 'customer_core' });

    await waitFor(() => {
      // Wait for schema to load and ETL tracking fields to render
      const autoFillLabels = screen.getAllByText('系統自動填充');
      expect(autoFillLabels.length).toBe(3);
    });
  });

  it('TS-F036-033: regular field selects are editable (dropdown style)', async () => {
    const user = userEvent.setup();
    const { onNodeDataChange } = renderLoadProperties({ targetTable: 'customer_core' });

    await waitFor(() => {
      // Wait for fields to appear in category A (expanded by default)
      expect(screen.getByText('customer_id')).toBeInTheDocument();
    });

    // Find selects for non-ETL fields (should have "-- 未對應 --" option)
    const selects = screen.getAllByTestId(/^load-field-select-/);
    expect(selects.length).toBeGreaterThan(0);
  });

  it('TS-F036-034: field mapping value updates correctly via select', async () => {
    const user = userEvent.setup();
    const { onNodeDataChange } = renderLoadProperties({
      targetTable: 'customer_core',
      fieldMappings: { source_customer_no: 'CUSTO_NO' },
    });

    await waitFor(() => {
      expect(screen.getByText('source_customer_no')).toBeInTheDocument();
    });
  });

  // --- New tests for A~H categorized UI ---

  describe('A~H Category Sections', () => {
    it('renders 8 category sections (A through H)', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-A')).toBeInTheDocument();
      });

      const categoryIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      for (const id of categoryIds) {
        expect(screen.getByTestId(`load-category-${id}`)).toBeInTheDocument();
      }
    });

    it('shows correct category names', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText('識別與分類')).toBeInTheDocument();
      });

      expect(screen.getByText('個人屬性')).toBeInTheDocument();
      expect(screen.getByText('聯絡資訊')).toBeInTheDocument();
      expect(screen.getByText('地址')).toBeInTheDocument();
      expect(screen.getByText('職業與就業')).toBeInTheDocument();
      expect(screen.getByText('財務與風控')).toBeInTheDocument();
      expect(screen.getByText('企業客戶專屬')).toBeInTheDocument();
      expect(screen.getByText('稽核與 ETL 追蹤')).toBeInTheDocument();
    });

    it('shows correct field count per category', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-A')).toBeInTheDocument();
      });

      // Each category header shows field count in parentheses - 8 categories total
      const countTexts = screen.getAllByText(/^\(\d+\)$/);
      expect(countTexts.length).toBe(8);

      // Verify specific counts via category containers
      const catA = screen.getByTestId('load-category-A');
      expect(within(catA).getByText('(5)')).toBeInTheDocument();

      const catE = screen.getByTestId('load-category-E');
      expect(within(catE).getByText('(12)')).toBeInTheDocument();

      const catG = screen.getByTestId('load-category-G');
      expect(within(catG).getByText('(13)')).toBeInTheDocument();
    });

    it('Category A is expanded by default, B~H are collapsed', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-A')).toBeInTheDocument();
      });

      // Category A fields should be visible
      const catA = screen.getByTestId('load-category-A');
      const catAContent = within(catA).getByTestId('load-category-A-content');
      expect(catAContent).not.toHaveClass('hidden');

      // Category B fields should be hidden
      const catB = screen.getByTestId('load-category-B');
      const catBContent = within(catB).getByTestId('load-category-B-content');
      expect(catBContent).toHaveClass('hidden');

      // Category H fields should be hidden
      const catH = screen.getByTestId('load-category-H');
      const catHContent = within(catH).getByTestId('load-category-H-content');
      expect(catHContent).toHaveClass('hidden');
    });

    it('clicking category header toggles expand/collapse', async () => {
      const user = userEvent.setup();
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-B')).toBeInTheDocument();
      });

      // B is collapsed by default
      const catB = screen.getByTestId('load-category-B');
      const catBContent = within(catB).getByTestId('load-category-B-content');
      expect(catBContent).toHaveClass('hidden');

      // Click B header to expand
      const catBHeader = within(catB).getByTestId('load-category-B-toggle');
      await user.click(catBHeader);
      expect(catBContent).not.toHaveClass('hidden');

      // Click again to collapse
      await user.click(catBHeader);
      expect(catBContent).toHaveClass('hidden');
    });
  });

  describe('Expand All / Collapse All', () => {
    it('renders expand all and collapse all buttons', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText('全部展開')).toBeInTheDocument();
        expect(screen.getByText('全部收合')).toBeInTheDocument();
      });
    });

    it('clicking expand all expands all categories', async () => {
      const user = userEvent.setup();
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText('全部展開')).toBeInTheDocument();
      });

      await user.click(screen.getByText('全部展開'));

      const categoryIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      for (const id of categoryIds) {
        const cat = screen.getByTestId(`load-category-${id}`);
        const content = within(cat).getByTestId(`load-category-${id}-content`);
        expect(content).not.toHaveClass('hidden');
      }
    });

    it('clicking collapse all collapses all categories', async () => {
      const user = userEvent.setup();
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText('全部展開')).toBeInTheDocument();
      });

      // First expand all
      await user.click(screen.getByText('全部展開'));
      // Then collapse all
      await user.click(screen.getByText('全部收合'));

      const categoryIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      for (const id of categoryIds) {
        const cat = screen.getByTestId(`load-category-${id}`);
        const content = within(cat).getByTestId(`load-category-${id}-content`);
        expect(content).toHaveClass('hidden');
      }
    });
  });

  describe('Mapping Summary Badges', () => {
    it('shows mapping summary badges with correct counts', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        // 已對應 (mapped) badge
        expect(screen.getByTestId('load-summary-mapped')).toBeInTheDocument();
        // 未對應 (unmapped) badge
        expect(screen.getByTestId('load-summary-unmapped')).toBeInTheDocument();
        // 必填未對應 (required-unmapped) badge
        expect(screen.getByTestId('load-summary-required-unmapped')).toBeInTheDocument();
        // 自動 (auto) badge
        expect(screen.getByTestId('load-summary-auto')).toBeInTheDocument();
      });

      // Auto should be 3 (data_source, _etl_loaded_at, _etl_pipeline_id)
      expect(screen.getByTestId('load-summary-auto')).toHaveTextContent('3');
    });

    it('auto badge shows 3 for ETL tracking fields', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        const autoBadge = screen.getByTestId('load-summary-auto');
        expect(autoBadge).toHaveTextContent('3');
      });
    });

    it('updates mapped/unmapped counts based on fieldMappings', async () => {
      renderLoadProperties({
        targetTable: 'customer_core',
        fieldMappings: {
          source_customer_no: 'CUSTO_NO',
          customer_type: 'CUSTOM_MK',
          name: 'CUS_NAME',
        },
      });

      await waitFor(() => {
        const mappedBadge = screen.getByTestId('load-summary-mapped');
        // 3 manually mapped fields
        expect(mappedBadge).toHaveTextContent('3');
      });
    });

    it('counts required-unmapped fields correctly (non-nullable, non-ETL, not mapped)', async () => {
      // customer_id, source_customer_no, customer_type, name are non-nullable non-ETL
      // With no field mappings, all 4 should be required-unmapped
      renderLoadProperties({
        targetTable: 'customer_core',
        fieldMappings: {},
      });

      await waitFor(() => {
        const reqBadge = screen.getByTestId('load-summary-required-unmapped');
        // 4 required fields: customer_id, source_customer_no, customer_type, name
        expect(reqBadge).toHaveTextContent('4');
      });
    });
  });

  describe('Category Badge Colors', () => {
    it('category A badge has blue color', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-A')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('load-category-badge-A');
      expect(badge).toHaveTextContent('A');
      expect(badge.className).toContain('bg-blue-100');
      expect(badge.className).toContain('text-blue-700');
    });

    it('category B badge has green color', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-badge-B')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('load-category-badge-B');
      expect(badge.className).toContain('bg-green-100');
      expect(badge.className).toContain('text-green-700');
    });

    it('category H badge has gray color', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-badge-H')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('load-category-badge-H');
      expect(badge.className).toContain('bg-gray-200');
      expect(badge.className).toContain('text-gray-600');
    });
  });

  describe('Category Mapped Count', () => {
    it('shows mapped/total count in category header', async () => {
      renderLoadProperties({
        targetTable: 'customer_core',
        fieldMappings: {
          source_customer_no: 'CUSTO_NO',
          customer_type: 'CUSTOM_MK',
          name: 'CUS_NAME',
          english_name: 'ENG_NAME',
          // These are all in category A (5 fields), so 4/5 mapped
        },
      });

      await waitFor(() => {
        const catA = screen.getByTestId('load-category-A');
        const counter = within(catA).getByTestId('load-category-A-counter');
        expect(counter).toHaveTextContent('4/5');
      });
    });
  });

  describe('ETL tracking fields in Category H', () => {
    it('ETL tracking fields show lock icon and auto-fill text in category H', async () => {
      const user = userEvent.setup();
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByTestId('load-category-H')).toBeInTheDocument();
      });

      // Expand category H
      const catH = screen.getByTestId('load-category-H');
      const catHToggle = within(catH).getByTestId('load-category-H-toggle');
      await user.click(catHToggle);

      // ETL tracking fields should show '系統自動填充'
      const autoFillLabels = screen.getAllByText('系統自動填充');
      expect(autoFillLabels.length).toBe(3);
    });
  });

  describe('fullMode Toggle', () => {
    it('renders fullMode toggle with label and description', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText('寫入模式')).toBeInTheDocument();
        expect(screen.getByText('全量重寫模式')).toBeInTheDocument();
        expect(screen.getByText('(fullMode)')).toBeInTheDocument();
      });

      // Toggle should exist with switch role
      const toggle = screen.getByRole('switch', { name: '全量重寫模式' });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('toggle defaults to OFF with UPSERT description', async () => {
      renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByText(/UPSERT/)).toBeInTheDocument();
      });

      // Warning should NOT be visible
      expect(screen.queryByText(/清空目標表/)).not.toBeInTheDocument();
    });

    it('toggle defaults to ON when fullMode=true in nodeData', async () => {
      renderLoadProperties({ targetTable: 'customer_core', fullMode: true });

      await waitFor(() => {
        const toggle = screen.getByRole('switch', { name: '全量重寫模式' });
        expect(toggle).toHaveAttribute('aria-checked', 'true');
      });

      // Warning SHOULD be visible (multiple text nodes may match)
      const warnings = screen.getAllByText(/清空目標表/);
      expect(warnings.length).toBeGreaterThan(0);
      // Safety note should be visible
      const safetyNotes = screen.getAllByText(/測試執行/);
      expect(safetyNotes.length).toBeGreaterThan(0);
    });

    it('clicking toggle calls onNodeDataChange with fullMode=true', async () => {
      const user = userEvent.setup();
      const { onNodeDataChange } = renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: '全量重寫模式' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('switch', { name: '全量重寫模式' }));

      expect(onNodeDataChange).toHaveBeenCalledWith('node-1', expect.objectContaining({
        fullMode: true,
      }));
    });

    it('clicking toggle ON triggers onChange, clicking OFF triggers onChange with false', async () => {
      const user = userEvent.setup();
      const { onNodeDataChange } = renderLoadProperties({ targetTable: 'customer_core' });

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: '全量重寫模式' })).toBeInTheDocument();
      });

      // Warning hidden initially
      expect(screen.queryByText(/清空目標表/)).not.toBeInTheDocument();

      // Click ON
      await user.click(screen.getByRole('switch', { name: '全量重寫模式' }));

      expect(onNodeDataChange).toHaveBeenCalledWith('node-1', expect.objectContaining({
        fullMode: true,
      }));
    });

    it('fullMode toggle is not rendered when no target table selected', async () => {
      renderLoadProperties({});

      await waitFor(() => {
        expect(screen.getByTestId('load-target-table-select')).toBeInTheDocument();
      });

      // fullMode toggle should not exist without a target table
      expect(screen.queryByText('寫入模式')).not.toBeInTheDocument();
    });
  });
});
