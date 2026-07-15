import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailPage } from '../customer-detail-page';
import * as c360Api from '@/api/c360';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/c360');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetDetail = vi.mocked(c360Api.getCustomerDetail);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const TEST_CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440000';

const fullCustomerResponse: c360Api.CustomerDetailResponse = {
  customerId: TEST_CUSTOMER_ID,
  identity: {
    sourceCustomerNo: 'A123456789',
    customerTypeCode: '01',
    customerTypeDesc: '個人',
    name: '王小明',
    englishName: 'Wang Xiao Ming',
  },
  personalAttributes: {
    gender: 'M',
    dateOfBirth: '1985-03-15',
    maritalStatusCode: '1',
    maritalStatusDesc: '已婚',
    educationCode: '06',
    educationDesc: '大學',
    spouseName: '李小美',
    fatherName: '王大明',
    motherName: '陳小花',
    idIssueType: '01',
    idIssueDate: '2020-01-15T00:00:00.000Z',
    idIssueAddress: '台北市中正區',
    driverLicense: 'D123456789',
  },
  contactInfo: {
    mobilePhone: '0912345678',
    homePhone: '02-23456789',
    contactPhone: '02-34567890',
    officePhone: '02-45678901',
    registeredPhone: '02-56789012',
    registeredFax: '02-56789013',
    businessFax: '02-67890123',
    businessMobile: '0922333444',
    email: 'wang@example.com',
    lineAccount: 'wang_line',
  },
  addresses: {
    residentialZip: '100',
    residentialAddress: '台北市中正區忠孝東路一段1號',
    mailingZip: '100',
    mailingAddress: '台北市中正區忠孝東路一段1號',
    registeredZip: '110',
    registeredAddress: '台北市信義區信義路五段7號',
    companyZip: '110',
    companyAddress: '台北市信義區松仁路100號',
    maturityMailingZip: '100',
    maturityMailingAddress: '台北市中正區忠孝東路一段1號',
  },
  employment: {
    companyName: '台灣科技股份有限公司',
    occupationCode: '0301',
    occupationDesc: '軟體工程師',
    jobTitleCode: '0102',
    jobTitleDesc: '經理',
    jobLevelCode: '03',
    jobLevelDesc: '中階主管',
    industryCode: 'H',
    industryDesc: '資訊及通訊傳播業',
    workYears: 10.5,
    companyScale: '1',
    role: '一般客戶',
  },
  financial: {
    monthlyIncomeCode: '05',
    monthlyIncomeDesc: '5萬~10萬',
    approvedIncome: 80000,
    incomeSourceCode: '01',
    incomeSourceDesc: '薪資所得',
    capital: null,
    creditLimit: 500000,
    highestTransactionAmount: 1200000,
    highestTransactionDate: '2025-06-15T00:00:00.000Z',
    hasRealEstate: 'Y',
    debtFlag: 'Y',
    fineFlag: 'Y',
    addressAnomalyFlag: 0,
    mainlandFlag: 0,
  },
  corporate: {
    ownerName: null,
    ownerId: null,
    ownerBirth: null,
    ownerZip: null,
    ownerAddress: null,
    establishedCapital: null,
    employeeCountCode: null,
    employeeCountDesc: null,
    isListedCode: null,
    isListedDesc: null,
    groupOwner: null,
    businessItem: null,
    organizationType: null,
    parentCustomerId: null,
    parentCustomerName: null,
  },
  etlTracking: {
    sourceCreatedAt: '2020-05-10T08:30:00.000Z',
    sourceUpdatedAt: '2025-12-01T14:22:00.000Z',
    dataSource: 'ZZIP+MLMC',
    etlLoadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    etlPipelineId: '660e8400-e29b-41d4-a716-446655440001',
  },
};

function setupMocks(role: 'admin' | 'user' = 'admin') {
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Test',
    email: 'test@cdmp.test',
    role,
  });
  mockedClearAuth.mockImplementation(() => {});
  mockedGetDetail.mockResolvedValue(fullCustomerResponse);
}

function renderDetailPage(customerId = TEST_CUSTOMER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/c360/customers/${customerId}`]}>
      <Routes>
        <Route path="/c360/customers/:customerId" element={<CustomerDetailPage />} />
        <Route path="/c360/customers" element={<div>Customer List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  // TS-F047-029: Header renders customer name, type badge, customer no
  it('TS-F047-029: header renders customer info', async () => {
    renderDetailPage();
    await waitFor(() => {
      // Name appears in header (h3) and in identity section
      const names = screen.getAllByText('王小明');
      expect(names.length).toBeGreaterThanOrEqual(1);
      // Type badge
      const badges = screen.getAllByText('個人');
      expect(badges.length).toBeGreaterThanOrEqual(1);
      // Customer no appears in header and identity
      const nos = screen.getAllByText('A123456789');
      expect(nos.length).toBeGreaterThanOrEqual(1);
    });
  });

  // TS-F047-030: 8 category sections rendered
  it('TS-F047-030: all 8 category sections rendered', async () => {
    renderDetailPage();
    // Wait for data to load first
    await waitFor(() => {
      const names = screen.getAllByText('王小明');
      expect(names.length).toBeGreaterThanOrEqual(1);
    });
    // Then check all 8 sections
    expect(screen.getByText('A. 識別與分類')).toBeInTheDocument();
    expect(screen.getByText('B. 個人屬性')).toBeInTheDocument();
    expect(screen.getByText('C. 聯絡資訊')).toBeInTheDocument();
    expect(screen.getByText('D. 地址')).toBeInTheDocument();
    expect(screen.getByText('E. 職業與就業')).toBeInTheDocument();
    expect(screen.getByText('F. 財務與風控')).toBeInTheDocument();
    expect(screen.getByText('G. 企業客戶專屬')).toBeInTheDocument();
    expect(screen.getByText('H. 稽核與 ETL 追蹤')).toBeInTheDocument();
  });

  // TS-F047-031: NULL fields show em dash
  it('TS-F047-031: null fields display em dash', async () => {
    renderDetailPage();
    await waitFor(() => {
      // capital is null in the test data
      const dashes = screen.getAllByText('\u2014');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // TS-F047-032: risk flag badges with warning color
  it('TS-F047-032: risk flags show warning badge when Y', async () => {
    renderDetailPage();
    await waitFor(() => {
      // 啟用旗標（debtFlag / fineFlag = 'Y'）改以具名 amber 徽章呈現：消債註記 / 罰鍰註記
      const warningBadges = [
        screen.getByText('消債註記'),
        screen.getByText('罰鍰註記'),
      ];
      warningBadges.forEach((el) => {
        expect(el.closest('[class*="bg-amber"]')).not.toBeNull();
      });
      expect(warningBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  // TS-F047-033: data freshness warning banner (NOT shown when < 7 days)
  it('TS-F047-026/033: no warning banner when etlLoadedAt < 7 days', async () => {
    renderDetailPage();
    await waitFor(() => {
      const names = screen.getAllByText('王小明');
      expect(names.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText(/可能非最新狀態/)).not.toBeInTheDocument();
  });

  // TS-F047-027/033: warning banner when > 7 days
  it('TS-F047-027/033: warning banner shown when etlLoadedAt > 7 days', async () => {
    const staleResponse = {
      ...fullCustomerResponse,
      etlTracking: {
        ...fullCustomerResponse.etlTracking,
        etlLoadedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      },
    };
    mockedGetDetail.mockResolvedValue(staleResponse);

    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/可能非最新狀態/)).toBeInTheDocument();
    });
  });

  // TS-F047-035: individual customer — G section shows "not applicable"
  it('TS-F047-035: individual customer G section shows not applicable', async () => {
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/本分類不適用/)).toBeInTheDocument();
    });
  });

  // TS-F047-034: corporate customer — G section shows data
  it('TS-F047-034: corporate customer G section shows data', async () => {
    const corpResponse: c360Api.CustomerDetailResponse = {
      ...fullCustomerResponse,
      identity: {
        ...fullCustomerResponse.identity,
        customerTypeCode: '02',
        customerTypeDesc: '企業',
      },
      corporate: {
        ownerName: '張三',
        ownerId: 'B111222333',
        ownerBirth: '1970-01-01',
        ownerZip: '100',
        ownerAddress: '台北市',
        establishedCapital: 1000000,
        employeeCountCode: '03',
        employeeCountDesc: '50-100人',
        isListedCode: 'Y',
        isListedDesc: '上市',
        groupOwner: '張三集團',
        businessItem: '軟體開發',
        organizationType: '股份有限',
        parentCustomerId: null,
        parentCustomerName: null,
      },
    };
    mockedGetDetail.mockResolvedValue(corpResponse);
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText('張三')).toBeInTheDocument();
      expect(screen.queryByText(/本分類不適用/)).not.toBeInTheDocument();
    });
  });

  // TS-F047-036: 404 shows error and back button
  it('TS-F047-036: 404 shows error message and back button', async () => {
    mockedGetDetail.mockRejectedValue({ response: { status: 404 } });
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByText(/找不到此客戶資料/)).toBeInTheDocument();
      const backLinks = screen.getAllByText(/返回清單/);
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // TS-F047-037: back button navigates to list
  it('TS-F047-037: back button links to customer list', async () => {
    renderDetailPage();
    await waitFor(() => {
      const names = screen.getAllByText('王小明');
      expect(names.length).toBeGreaterThanOrEqual(1);
    });
    const backLinks = screen.getAllByText(/返回清單/);
    const backLink = backLinks[0];
    expect(backLink.closest('a')).toHaveAttribute('href', '/c360/customers');
  });

  // TS-F047-018: code/desc combination display
  it('TS-F047-018: code/desc combo shows "desc(code)" format', async () => {
    renderDetailPage();
    await waitFor(() => {
      // maritalStatusDesc='已婚', maritalStatusCode='1' -> "已婚（1）"
      expect(screen.getByText(/已婚（1）/)).toBeInTheDocument();
    });
  });

  // TS-F047-019: null fields show em dash
  it('TS-F047-019: null fields show em dash, not "null" string', async () => {
    renderDetailPage();
    await waitFor(() => {
      expect(screen.queryByText('null')).not.toBeInTheDocument();
      expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    });
  });

  // TS-F047-038: Admin vs User masking difference
  it('TS-F047-038: Admin sees plaintext, User sees masked', async () => {
    // Admin renders plaintext
    const { unmount: unmount1 } = renderDetailPage();
    await waitFor(() => {
      const nos = screen.getAllByText('A123456789');
      expect(nos.length).toBeGreaterThanOrEqual(1);
    });
    unmount1();

    // User renders masked values
    vi.clearAllMocks();
    setupMocks('user');
    const maskedResponse = {
      ...fullCustomerResponse,
      identity: {
        ...fullCustomerResponse.identity,
        sourceCustomerNo: 'A12*****89',
      },
    };
    mockedGetDetail.mockResolvedValue(maskedResponse);

    renderDetailPage();
    await waitFor(() => {
      const maskedNos = screen.getAllByText('A12*****89');
      expect(maskedNos.length).toBeGreaterThanOrEqual(1);
    });
  });
});
