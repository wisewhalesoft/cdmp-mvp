import { apiClient } from './client';

export interface CustomerStats {
  total: number;
  individual: number;
  corporate: number;
  foreign: number;
}

export interface CustomerListItem {
  customerId: string;
  name: string;
  customerTypeCode: string;
  customerTypeDesc: string | null;
  sourceCustomerNo: string;
  mobilePhone: string | null;
  companyName: string | null;
}

export interface CustomerListResponse {
  data: CustomerListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerListParams {
  keyword?: string;
  idNumber?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerDetailResponse {
  customerId: string;
  identity: {
    sourceCustomerNo: string;
    customerTypeCode: string;
    customerTypeDesc: string | null;
    name: string;
    englishName: string | null;
  };
  personalAttributes: {
    gender: string | null;
    dateOfBirth: string | null;
    maritalStatusCode: string | null;
    maritalStatusDesc: string | null;
    educationCode: string | null;
    educationDesc: string | null;
    spouseName: string | null;
    fatherName: string | null;
    motherName: string | null;
    idIssueType: string | null;
    idIssueDate: string | null;
    idIssueAddress: string | null;
    driverLicense: string | null;
  };
  contactInfo: {
    mobilePhone: string | null;
    homePhone: string | null;
    contactPhone: string | null;
    officePhone: string | null;
    registeredPhone: string | null;
    registeredFax: string | null;
    businessFax: string | null;
    businessMobile: string | null;
    email: string | null;
    lineAccount: string | null;
  };
  addresses: {
    residentialZip: string | null;
    residentialAddress: string | null;
    mailingZip: string | null;
    mailingAddress: string | null;
    registeredZip: string | null;
    registeredAddress: string | null;
    companyZip: string | null;
    companyAddress: string | null;
    maturityMailingZip: string | null;
    maturityMailingAddress: string | null;
  };
  employment: {
    companyName: string | null;
    occupationCode: string | null;
    occupationDesc: string | null;
    jobTitleCode: string | null;
    jobTitleDesc: string | null;
    jobLevelCode: string | null;
    jobLevelDesc: string | null;
    industryCode: string | null;
    industryDesc: string | null;
    workYears: number | null;
    companyScale: string | null;
    role: string | null;
  };
  financial: {
    monthlyIncomeCode: string | null;
    monthlyIncomeDesc: string | null;
    approvedIncome: number | null;
    incomeSourceCode: string | null;
    incomeSourceDesc: string | null;
    capital: number | null;
    creditLimit: number | null;
    highestTransactionAmount: number | null;
    highestTransactionDate: string | null;
    hasRealEstate: string | null;
    debtFlag: string | null;
    fineFlag: string | null;
    addressAnomalyFlag: number | null;
    mainlandFlag: number | null;
  };
  corporate: {
    ownerName: string | null;
    ownerId: string | null;
    ownerBirth: string | null;
    ownerZip: string | null;
    ownerAddress: string | null;
    establishedCapital: number | null;
    employeeCountCode: string | null;
    employeeCountDesc: string | null;
    isListedCode: string | null;
    isListedDesc: string | null;
    groupOwner: string | null;
    businessItem: string | null;
    organizationType: string | null;
    parentCustomerId: string | null;
    parentCustomerName: string | null;
  };
  etlTracking: {
    sourceCreatedAt: string | null;
    sourceUpdatedAt: string | null;
    dataSource: string;
    etlLoadedAt: string;
    etlPipelineId: string;
  };
}

export async function getCustomerStats(): Promise<CustomerStats> {
  const response = await apiClient.get<CustomerStats>('/c360/customers/stats');
  return response.data;
}

export async function getCustomers(params: CustomerListParams = {}): Promise<CustomerListResponse> {
  const response = await apiClient.get<CustomerListResponse>('/c360/customers', { params });
  return response.data;
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetailResponse> {
  const response = await apiClient.get<CustomerDetailResponse>(`/c360/customers/${customerId}`);
  return response.data;
}
