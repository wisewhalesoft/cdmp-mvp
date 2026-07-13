/**
 * F112 / AD-E07-47 §3.1 / §9：ROUTE 群組 — 路由不遮蔽 regression
 *
 * 以「讀取 controller method 之路由 metadata（path + HTTP method）」為等價斷言（AD §8「或等價斷言」），
 * 證明新增 :columnName/distinct-values 與 options/bulk 之路徑字面量 / HTTP method 與既有端點互不衝突、
 * 不遮蔽既有 available-columns / active-options-count / 單筆新增 / reorder / deactivate / reactivate。
 */

import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PooldataFieldWhitelistController } from '../controllers/pooldata-field-whitelist.controller';
import { PooldataFieldOptionController } from '../controllers/pooldata-field-option.controller';

const pathOf = (handler: any): string =>
  Reflect.getMetadata(PATH_METADATA, handler);
const methodOf = (handler: any): number =>
  Reflect.getMetadata(METHOD_METADATA, handler);

describe('F112 ROUTE — 路由不遮蔽 regression', () => {
  const W = PooldataFieldWhitelistController.prototype;
  const O = PooldataFieldOptionController.prototype;

  it('ROUTE-001：available-columns（單段靜態 GET）與 distinct-values（兩段靜態 GET）路徑字面量不同、互不遮蔽', () => {
    expect(pathOf(W.getAvailableColumns)).toBe('available-columns');
    expect(methodOf(W.getAvailableColumns)).toBe(RequestMethod.GET);

    expect(pathOf(W.getDistinctValues)).toBe(':columnName/distinct-values');
    expect(methodOf(W.getDistinctValues)).toBe(RequestMethod.GET);

    // distinct-values 為兩段路徑（:columnName 之下），不被單段動態路由遮蔽
    expect(pathOf(W.getDistinctValues)).not.toBe(pathOf(W.getAvailableColumns));
  });

  it('ROUTE-002：active-options-count 與 distinct-values 為兩段式靜態字面量、互不影響', () => {
    expect(pathOf(W.getActiveOptionCount)).toBe(':columnName/active-options-count');
    expect(methodOf(W.getActiveOptionCount)).toBe(RequestMethod.GET);
    expect(pathOf(W.getDistinctValues)).toBe(':columnName/distinct-values');
    expect(pathOf(W.getActiveOptionCount)).not.toBe(pathOf(W.getDistinctValues));
  });

  it('ROUTE-003：POST bulk 不遮蔽既有 POST /（單筆）、PATCH reorder / :optionValue/deactivate / :optionValue', () => {
    // 新增 bulk：POST 'bulk'
    expect(pathOf(O.createOptionsBulk)).toBe('bulk');
    expect(methodOf(O.createOptionsBulk)).toBe(RequestMethod.POST);

    // 既有單筆新增：POST base '/'
    expect(pathOf(O.createOption)).toBe('/');
    expect(methodOf(O.createOption)).toBe(RequestMethod.POST);
    // 同為 POST 但路徑字面量不同（'bulk' vs '/'），NestJS 依完整路徑匹配、無 route param 衝突
    expect(pathOf(O.createOptionsBulk)).not.toBe(pathOf(O.createOption));

    // 既有 PATCH 路由維持不變
    expect(pathOf(O.reorderOptions)).toBe('reorder');
    expect(methodOf(O.reorderOptions)).toBe(RequestMethod.PATCH);
    expect(pathOf(O.deactivateOption)).toBe(':optionValue/deactivate');
    expect(methodOf(O.deactivateOption)).toBe(RequestMethod.PATCH);
    expect(pathOf(O.reactivateOption)).toBe(':optionValue');
    expect(methodOf(O.reactivateOption)).toBe(RequestMethod.PATCH);
  });
});
