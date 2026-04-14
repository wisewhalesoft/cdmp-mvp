import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { CustomerListPage } from '../customer-list-page';
import * as c360Api from '@/api/c360';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/c360');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetStats = vi.mocked(c360Api.getCustomerStats);
const mockedGetCustomers = vi.mocked(c360Api.getCustomers);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

function setupMocks(overrides?: {
  stats?: c360Api.CustomerStats;
  customers?: c360Api.CustomerListResponse;
}) {
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Test User',
    email: 'test@cdmp.test',
    role: 'admin',
  });
  mockedClearAuth.mockImplementation(() => {});

  mockedGetStats.mockResolvedValue(
    overrides?.stats ?? {
      total: 100,
      individual: 60,
      corporate: 30,
      foreign: 10,
    },
  );

  mockedGetCustomers.mockResolvedValue(
    overrides?.customers ?? {
      data: [
        {
          customerId: '550e8400-e29b-41d4-a716-446655440000',
          name: '王小明',
          customerTypeCode: '01',
          customerTypeDesc: '個人',
          sourceCustomerNo: 'A12*****89',
          mobilePhone: '0912****78',
          companyName: '台灣科技',
        },
        {
          customerId: '550e8400-e29b-41d4-a716-446655440001',
          name: '台灣科技股份有限公司',
          customerTypeCode: '02',
          customerTypeDesc: '企業',
          sourceCustomerNo: 'B98*****21',
          mobilePhone: null,
          companyName: null,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      },
    },
  );
}

function renderPage() {
  return render(
    <BrowserRouter>
      <CustomerListPage />
    </BrowserRouter>,
  );
}

describe('CustomerListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  // TS-F046-024: Stats cards render correct values
  it('TS-F046-024: stats cards render correct values', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  // TS-F046-025: keyword < 2 chars shows hint, doesn't trigger API
  it('TS-F046-025: keyword < 2 chars shows hint and does not call API', async () => {
    renderPage();
    await waitFor(() => expect(mockedGetCustomers).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByPlaceholderText(/搜尋客戶姓名/);
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, '王');
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(screen.getByText(/請輸入至少 2 個字元/)).toBeInTheDocument();
    // Should not have triggered an additional API call
    expect(mockedGetCustomers).toHaveBeenCalledTimes(1);
  });

  // TS-F046-026: type filter triggers API call
  it('TS-F046-026: type filter change triggers API call with type param', async () => {
    renderPage();
    await waitFor(() => expect(mockedGetCustomers).toHaveBeenCalledTimes(1));

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, '02');

    await waitFor(() => {
      expect(mockedGetCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ type: '02' }),
      );
    });
  });

  // TS-F046-027: table renders correct fields
  it('TS-F046-027: table renders customer data with masked values', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('王小明')).toBeInTheDocument();
      expect(screen.getByText('A12*****89')).toBeInTheDocument();
      expect(screen.getByText('0912****78')).toBeInTheDocument();
      expect(screen.getByText('台灣科技')).toBeInTheDocument();
    });
  });

  // TS-F046-028: pagination navigation
  it('TS-F046-028: pagination next page triggers API call', async () => {
    setupMocks({
      customers: {
        data: [
          {
            customerId: '1',
            name: '客戶一',
            customerTypeCode: '01',
            customerTypeDesc: '個人',
            sourceCustomerNo: 'A11111',
            mobilePhone: null,
            companyName: null,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('客戶一')).toBeInTheDocument());

    const nextBtn = screen.getByLabelText('下一頁');
    await userEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockedGetCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
  });

  // TS-F046-029: empty search result shows empty state
  it('TS-F046-029: empty search result shows empty state message', async () => {
    setupMocks({
      customers: {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/找不到符合條件的客戶/)).toBeInTheDocument();
      expect(screen.getByText(/清除篩選條件/)).toBeInTheDocument();
    });
  });

  // TS-F046-030: no data state
  it('TS-F046-030: customer_core no data shows ETL message', async () => {
    setupMocks({
      stats: { total: 0, individual: 0, corporate: 0, foreign: 0 },
      customers: {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/客戶資料尚未載入/)).toBeInTheDocument();
      // All 4 stat cards show 0
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(4);
    });
  });

  // TS-F046-031: clicking a customer row navigates to detail page
  it('TS-F046-031: clicking customer row navigates to detail page', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    const viewBtn = screen.getAllByText('查看')[0];
    expect(viewBtn.closest('a')).toHaveAttribute(
      'href',
      '/c360/customers/550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
