import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  UserX,
  User as UserIcon,
  Building2,
  Fingerprint,
  UserCircle,
  Phone,
  MapPin,
  Briefcase,
  ShieldAlert,
  Building,
  FileClock,
  Info,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { getCustomerDetail, type CustomerDetailResponse } from '@/api/c360';
import { PiiMaskBanner } from './_components/pii-mask-banner';
import { getUserRole, getBusinessRole } from '@/stores/auth-store';

/** Format code/desc combo: "desc（code）" */
function formatCodeDesc(code: string | null, desc: string | null): string {
  if (desc && code) return `${desc}（${code}）`;
  if (desc) return desc;
  if (code) return code;
  return '\u2014';
}

/** Display value or em dash for null */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '\u2014';
  return String(value);
}

/** Format number with commas */
function formatNumber(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  return Number(value).toLocaleString('zh-TW');
}

/** Format date to YYYY-MM-DD */
function formatDate(value: unknown): string {
  if (!value) return '\u2014';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return '\u2014';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format datetime to UTC+8 */
function formatDateTime(value: unknown): string {
  if (!value) return '\u2014';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return '\u2014';
  const utc8 = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = utc8.getUTCFullYear();
  const m = String(utc8.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc8.getUTCDate()).padStart(2, '0');
  const h = String(utc8.getUTCHours()).padStart(2, '0');
  const min = String(utc8.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** Calculate days since a date */
function daysSince(isoDate: string): number {
  return Math.ceil((Date.now() - new Date(isoDate).getTime()) / (24 * 60 * 60 * 1000));
}

/** Format gender */
function formatGender(val: unknown): string {
  if (val === 'M') return '男';
  if (val === 'F') return '女';
  return displayValue(val);
}

/** Format address with zip */
function formatAddress(zip: unknown, address: unknown): string {
  if (!address) return '\u2014';
  return (zip ? zip + ' ' : '') + String(address);
}

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  A: <Fingerprint size={16} className="text-[#2563EB]" />,
  B: <UserCircle size={16} className="text-[#2563EB]" />,
  C: <Phone size={16} className="text-[#2563EB]" />,
  D: <MapPin size={16} className="text-[#2563EB]" />,
  E: <Briefcase size={16} className="text-[#2563EB]" />,
  F: <ShieldAlert size={16} className="text-[#2563EB]" />,
  G: <Building size={16} className="text-gray-500" />,
  H: <FileClock size={16} className="text-[#2563EB]" />,
};

type FieldDef = { label: string; value: string; isFlag?: boolean; flagLabel?: string; flagActive?: boolean };

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['A', 'B', 'C']));

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    getCustomerDetail(customerId)
      .then((data) => {
        setCustomer(data);
        setError(null);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('not_found');
        } else {
          setError('unknown');
        }
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dataStale = customer?.etlTracking?.etlLoadedAt
    ? daysSince(customer.etlTracking.etlLoadedAt) > 7
    : false;
  const staleDays = customer?.etlTracking?.etlLoadedAt
    ? daysSince(customer.etlTracking.etlLoadedAt)
    : 0;

  const isCorporate = customer?.identity?.customerTypeCode === '02';
  const isIndividualOrForeign =
    customer?.identity?.customerTypeCode === '01' ||
    customer?.identity?.customerTypeCode === '04';

  // Build 8 categories
  const buildCategories = (): { id: string; title: string; fields: FieldDef[]; notApplicable?: boolean }[] => {
    if (!customer) return [];
    const c = customer;

    return [
      {
        id: 'A',
        title: 'A. 識別與分類',
        fields: [
          { label: '客戶 ID', value: displayValue(c.customerId) },
          { label: '客戶編號', value: displayValue(c.identity.sourceCustomerNo) },
          { label: '客戶類型', value: formatCodeDesc(c.identity.customerTypeCode, c.identity.customerTypeDesc) },
          { label: '姓名/企業名稱', value: displayValue(c.identity.name) },
          { label: '英文姓名', value: displayValue(c.identity.englishName) },
        ],
      },
      {
        id: 'B',
        title: 'B. 個人屬性',
        fields: [
          { label: '性別', value: formatGender(c.personalAttributes.gender) },
          { label: '生日', value: formatDate(c.personalAttributes.dateOfBirth) },
          { label: '婚姻狀態', value: formatCodeDesc(c.personalAttributes.maritalStatusCode, c.personalAttributes.maritalStatusDesc) },
          { label: '學歷', value: formatCodeDesc(c.personalAttributes.educationCode, c.personalAttributes.educationDesc) },
          { label: '配偶姓名', value: displayValue(c.personalAttributes.spouseName) },
          { label: '父親姓名', value: displayValue(c.personalAttributes.fatherName) },
          { label: '母親姓名', value: displayValue(c.personalAttributes.motherName) },
          { label: '發證類別', value: displayValue(c.personalAttributes.idIssueType) },
          { label: '發證日期', value: formatDate(c.personalAttributes.idIssueDate) },
          { label: '發證地址', value: displayValue(c.personalAttributes.idIssueAddress) },
          { label: '駕照號碼', value: displayValue(c.personalAttributes.driverLicense) },
        ],
      },
      {
        id: 'C',
        title: 'C. 聯絡資訊',
        fields: [
          { label: '行動電話', value: displayValue(c.contactInfo.mobilePhone) },
          { label: '戶籍電話', value: displayValue(c.contactInfo.homePhone) },
          { label: '通訊電話', value: displayValue(c.contactInfo.contactPhone) },
          { label: '公司電話', value: displayValue(c.contactInfo.officePhone) },
          { label: '公司登記電話', value: displayValue(c.contactInfo.registeredPhone) },
          { label: '公司傳真', value: displayValue(c.contactInfo.registeredFax) },
          { label: '營業傳真', value: displayValue(c.contactInfo.businessFax) },
          { label: '營業行動電話', value: displayValue(c.contactInfo.businessMobile) },
          { label: 'Email', value: displayValue(c.contactInfo.email) },
          { label: 'Line 帳號', value: displayValue(c.contactInfo.lineAccount) },
        ],
      },
      {
        id: 'D',
        title: 'D. 地址',
        fields: [
          { label: '戶籍地址', value: formatAddress(c.addresses.residentialZip, c.addresses.residentialAddress) },
          { label: '通訊地址', value: formatAddress(c.addresses.mailingZip, c.addresses.mailingAddress) },
          { label: '公司登記地址', value: formatAddress(c.addresses.registeredZip, c.addresses.registeredAddress) },
          { label: '營業地址', value: formatAddress(c.addresses.companyZip, c.addresses.companyAddress) },
          { label: '滿期寄送地址', value: formatAddress(c.addresses.maturityMailingZip, c.addresses.maturityMailingAddress) },
        ],
      },
      {
        id: 'E',
        title: 'E. 職業與就業',
        fields: [
          { label: '服務公司', value: displayValue(c.employment.companyName) },
          { label: '職業', value: formatCodeDesc(c.employment.occupationCode, c.employment.occupationDesc) },
          { label: '職稱', value: formatCodeDesc(c.employment.jobTitleCode, c.employment.jobTitleDesc) },
          { label: '職級', value: formatCodeDesc(c.employment.jobLevelCode, c.employment.jobLevelDesc) },
          { label: '行業', value: formatCodeDesc(c.employment.industryCode, c.employment.industryDesc) },
          { label: '年資', value: c.employment.workYears != null ? c.employment.workYears + ' 年' : '\u2014' },
          { label: '公司規模', value: displayValue(c.employment.companyScale) },
          { label: '客戶角色', value: displayValue(c.employment.role) },
        ],
      },
      {
        id: 'F',
        title: 'F. 財務與風控',
        fields: [
          { label: '月所得', value: formatCodeDesc(c.financial.monthlyIncomeCode, c.financial.monthlyIncomeDesc) },
          { label: '認定月收入', value: formatNumber(c.financial.approvedIncome) },
          { label: '收入來源', value: formatCodeDesc(c.financial.incomeSourceCode, c.financial.incomeSourceDesc) },
          { label: '實收資本額', value: formatNumber(c.financial.capital) },
          { label: '額度總額', value: formatNumber(c.financial.creditLimit) },
          { label: '最高往來金額', value: formatNumber(c.financial.highestTransactionAmount) },
          { label: '最高往來日期', value: formatDate(c.financial.highestTransactionDate) },
          { label: '自有不動產', value: displayValue(c.financial.hasRealEstate) },
          { label: '消債旗標', value: displayValue(c.financial.debtFlag), isFlag: true, flagLabel: '消債註記', flagActive: c.financial.debtFlag === 'Y' },
          { label: '違規欠稅旗標', value: displayValue(c.financial.fineFlag), isFlag: true, flagLabel: '罰鍰註記', flagActive: c.financial.fineFlag === 'Y' },
          { label: '地址異常註記', value: displayValue(c.financial.addressAnomalyFlag) },
          { label: '大陸籍旗標', value: displayValue(c.financial.mainlandFlag) },
        ],
      },
      {
        id: 'G',
        title: 'G. 企業客戶專屬',
        notApplicable: isIndividualOrForeign,
        fields: isCorporate && c.corporate ? [
          { label: '負責人姓名', value: displayValue(c.corporate.ownerName) },
          { label: '負責人身分證', value: displayValue(c.corporate.ownerId) },
          { label: '負責人生日', value: formatDate(c.corporate.ownerBirth) },
          { label: '負責人郵遞區號', value: displayValue(c.corporate.ownerZip) },
          { label: '負責人地址', value: displayValue(c.corporate.ownerAddress) },
          { label: '登記資本額', value: formatNumber(c.corporate.establishedCapital) },
          { label: '員工人數', value: formatCodeDesc(c.corporate.employeeCountCode, c.corporate.employeeCountDesc) },
          { label: '上市櫃', value: formatCodeDesc(c.corporate.isListedCode, c.corporate.isListedDesc) },
          { label: '集團實際負責人', value: displayValue(c.corporate.groupOwner) },
          { label: '營業項目', value: displayValue(c.corporate.businessItem) },
          { label: '組織形態', value: displayValue(c.corporate.organizationType) },
          { label: '母公司客戶 ID', value: displayValue(c.corporate.parentCustomerId) },
          { label: '母公司名稱', value: displayValue(c.corporate.parentCustomerName) },
        ] : [],
      },
      {
        id: 'H',
        title: 'H. 稽核與 ETL 追蹤',
        fields: [
          { label: '來源建檔日期', value: formatDateTime(c.etlTracking.sourceCreatedAt) },
          { label: '來源最後更新', value: formatDateTime(c.etlTracking.sourceUpdatedAt) },
          { label: '資料來源', value: displayValue(c.etlTracking.dataSource) },
          { label: 'ETL 載入時間', value: formatDateTime(c.etlTracking.etlLoadedAt) },
          { label: 'Pipeline ID', value: displayValue(c.etlTracking.etlPipelineId) },
        ],
      },
    ];
  };

  const categories = buildCategories();

  const headerLeft = (
    <div className="flex items-center gap-3">
      <h1 className="text-base font-semibold text-gray-800">Customer 360</h1>
      {customer && (
        <>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">{customer.identity.name}</span>
        </>
      )}
    </div>
  );

  return (
    <AppLayout headerLeft={headerLeft}>
      <main className="flex-1 p-6">
          {/* Loading */}
          {loading && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center">
              <p className="text-gray-400">載入中...</p>
            </div>
          )}

          {/* 404 Not Found */}
          {error === 'not_found' && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <UserX size={32} className="text-[#EF4444]" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-2">找不到此客戶資料</h3>
              <p className="text-sm text-gray-500 mb-4">請確認客戶 ID 是否正確，或該客戶可能已被移除</p>
              <Link
                to="/c360/customers"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 transition shadow-sm"
              >
                <ArrowLeft size={16} />
                返回清單
              </Link>
            </div>
          )}

          {/* Unknown Error */}
          {error === 'unknown' && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center">
              <p className="text-gray-500">無法載入客戶資料，請重新整理頁面</p>
            </div>
          )}

          {/* Customer Content */}
          {customer && !error && (
            <>
              {/* P2-1 Phase 3：plain user 顯示 PII masked 提示 banner */}
              <div className="mb-4">
                <PiiMaskBanner
                  userRole={getUserRole()}
                  businessRole={getBusinessRole()}
                />
              </div>

              {/* Back Link */}
              <div className="mb-6">
                <Link
                  to="/c360/customers"
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#2563EB] transition mb-4"
                >
                  <ArrowLeft size={16} />
                  返回清單
                </Link>

                {/* Customer Header Card */}
                <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isCorporate ? 'bg-green-100' : 'bg-blue-100'}`}>
                      {isCorporate ? (
                        <Building2 size={24} className="text-[#22C55E]" />
                      ) : (
                        <UserIcon size={24} className="text-[#2563EB]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-900">{customer.identity.name}</h2>
                        <TypeBadge code={customer.identity.customerTypeCode} desc={customer.identity.customerTypeDesc} />
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        客戶編號：<span className="font-mono">{customer.identity.sourceCustomerNo}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Freshness Warning Banner */}
                {dataStale && (
                  <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle size={20} className="text-[#F59E0B] shrink-0" />
                    <span className="text-sm text-amber-800">
                      此客戶資料最後更新於 <strong>{staleDays}</strong> 天前，可能非最新狀態
                    </span>
                  </div>
                )}
              </div>

              {/* 8 Data Category Accordions */}
              <div className="space-y-3">
                {categories.map((cat) => {
                  const isOpen = openCategories.has(cat.id);
                  const iconBg = cat.id === 'G' && cat.notApplicable ? 'bg-gray-100' : 'bg-blue-50';

                  return (
                    <div key={cat.id} className="bg-white rounded-lg border border-[#E5E7EB]">
                      {/* Accordion Header */}
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
                            {CATEGORY_ICONS[cat.id]}
                          </div>
                          <h3 className="text-sm font-semibold text-gray-700">{cat.title}</h3>
                          {!cat.notApplicable && (
                            <span className="text-xs text-gray-400">{cat.fields.length} 個欄位</span>
                          )}
                        </div>
                        <ChevronDown
                          size={16}
                          className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {/* Accordion Content */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[2000px]' : 'max-h-0'}`}
                      >
                        <div className="px-5 pb-4">
                          {cat.notApplicable ? (
                            <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
                              <Info size={16} />
                              <span className="text-sm">本分類不適用</span>
                            </div>
                          ) : (
                            <dl>
                              {cat.fields.map((f, idx) => (
                                <div key={idx} className="grid grid-cols-3 gap-4 py-2.5 border-b border-gray-50 last:border-0">
                                  <dt className="text-sm text-gray-500">{f.label}</dt>
                                  <dd className="text-sm text-gray-900 col-span-2 font-mono text-xs break-all">
                                    {f.isFlag && f.flagActive ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                                        <AlertTriangle size={12} />
                                        {f.flagLabel}
                                      </span>
                                    ) : (
                                      f.value
                                    )}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
      </main>
    </AppLayout>
  );
}

function TypeBadge({ code, desc }: { code: string; desc: string | null }) {
  const styles: Record<string, string> = {
    '01': 'bg-blue-100 text-blue-700',
    '02': 'bg-green-100 text-green-700',
    '04': 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[code] ?? 'bg-gray-100 text-gray-700'}`}>
      {desc ?? code}
    </span>
  );
}
