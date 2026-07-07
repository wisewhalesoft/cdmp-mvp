/**
 * useConditionDecoder 測試共用 fixture（listFields / listOptions / listCardTypes 回應）。
 *
 * 值取自 apps/api/.../1711360000001-BaselineReferenceData.ts 之代表性子集，
 * 供名單卡片 / Detail Drawer / 從上月複製 / 準備完成詳情 四處測試共用，確保
 * 「已知代碼 → 已知中文標籤」斷言與真實 seed 一致，且未涵蓋之代碼可驗 raw fallback。
 */
import type {
  ListFieldsResponse,
  ListOptionsResponse,
  PooldataOption,
} from '@/api/pooldata-fields';
import type { ListCardTypesResponse } from '@/api/card-type';

export const DECODER_FIELDS: ListFieldsResponse = {
  fields: [
    { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'caseyear', displayName: '進件 / 滿期年數', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'spec_tp', displayName: '專案類別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'case_status', displayName: '案件結清期別', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'settle_src', displayName: '他行代償', fieldType: 'categorical', isActive: true, createdAt: '', updatedAt: '' },
    { columnName: 'month_cnt', displayName: '在名單月數', fieldType: 'numeric', isActive: true, createdAt: '', updatedAt: '' },
  ],
};

function opt(columnName: string, optionValue: string, optionLabel: string): PooldataOption {
  return { columnName, optionValue, optionLabel, isActive: true, createdAt: '', updatedAt: '' };
}

export const DECODER_OPTIONS: Record<string, PooldataOption[]> = {
  prod_kind: [opt('prod_kind', '01', '汽車'), opt('prod_kind', '02', '機車'), opt('prod_kind', '03', '一般商品')],
  caseyear: [
    opt('caseyear', '0', '0 年'),
    opt('caseyear', '1', '1 年'),
    opt('caseyear', '2', '2 年'),
    opt('caseyear', '3', '3 年'),
    opt('caseyear', '4', '4 年'),
    opt('caseyear', '99', '不限年數'),
  ],
  spec_tp: [
    opt('spec_tp', '01', '本牌/新車'),
    opt('spec_tp', '08', '信貸'),
    opt('spec_tp', '11', '他牌/新車'),
    opt('spec_tp', '12', '他牌/中古'),
  ],
  case_status: [
    opt('case_status', '01', '期中(不含當月滿期)'),
    opt('case_status', '02', '中結'),
    opt('case_status', '03', '滿期(含當月滿期)'),
  ],
  settle_src: [opt('settle_src', 'Y', '含他行代償'), opt('settle_src', 'N', '不含他行代償')],
};

export function optionsResponseFor(columnName: string): ListOptionsResponse {
  return { options: DECODER_OPTIONS[columnName] ?? [] };
}

export const DECODER_CARD_TYPES: ListCardTypesResponse = {
  cardTypes: [
    { cardType: 'M3', cardName: '滿期卡', prodKind: '01', prodKindName: '汽車', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'M2', cardName: '中結卡', prodKind: '02', prodKindName: '機車', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
    { cardType: 'H', cardName: '期中卡', prodKind: '01', prodKindName: '汽車', status: 'active', cardVersion: 1, sdate: null, edate: null, createdBy: null, createdAt: null },
  ],
};
