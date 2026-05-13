import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUser,
  getUserRole,
  getIsSalesManager,
  setAuth,
  clearAuth,
  isAuthenticated,
} from '../auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getIsSalesManager', () => {
    it('回傳 true — user 帳號且 isSalesManager === true', () => {
      setAuth('token-1', {
        id: 'u1',
        name: 'Manager',
        email: 'manager@cdmp.test',
        role: 'user',
        isSalesManager: true,
      });
      expect(getIsSalesManager()).toBe(true);
    });

    it('回傳 false — user 帳號且 isSalesManager === false', () => {
      setAuth('token-2', {
        id: 'u2',
        name: 'User',
        email: 'user@cdmp.test',
        role: 'user',
        isSalesManager: false,
      });
      expect(getIsSalesManager()).toBe(false);
    });

    // T-012（新增）：JWT 無 isSalesManager 欄位時保守視為 false
    it('回傳 false — isSalesManager 欄位缺失（舊 token）', () => {
      setAuth('token-3', {
        id: 'u3',
        name: 'Legacy',
        email: 'legacy@cdmp.test',
        role: 'user',
        // isSalesManager intentionally omitted
      });
      expect(getIsSalesManager()).toBe(false);
    });

    // 嚴格 === true 比對
    it('回傳 false — isSalesManager 為 truthy 字串 "true"（非 boolean）', () => {
      localStorage.setItem('token', 'tok');
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: 'u4',
          name: 'Tricky',
          email: 't@cdmp.test',
          role: 'user',
          isSalesManager: 'true',
        }),
      );
      expect(getIsSalesManager()).toBe(false);
    });

    it('回傳 false — isSalesManager 為數字 1', () => {
      localStorage.setItem('token', 'tok');
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: 'u5',
          name: 'Tricky2',
          email: 't2@cdmp.test',
          role: 'user',
          isSalesManager: 1,
        }),
      );
      expect(getIsSalesManager()).toBe(false);
    });

    it('回傳 false — 未登入', () => {
      expect(getIsSalesManager()).toBe(false);
    });
  });

  describe('既有 helper（regression）', () => {
    it('getUserRole 回傳 admin', () => {
      setAuth('tok', {
        id: 'a1',
        name: 'Admin',
        email: 'admin@cdmp.test',
        role: 'admin',
      });
      expect(getUserRole()).toBe('admin');
    });

    it('isAuthenticated true after setAuth', () => {
      setAuth('tok', {
        id: 'a1',
        name: 'Admin',
        email: 'admin@cdmp.test',
        role: 'admin',
      });
      expect(isAuthenticated()).toBe(true);
    });

    it('clearAuth 清空 localStorage', () => {
      setAuth('tok', {
        id: 'a1',
        name: 'Admin',
        email: 'admin@cdmp.test',
        role: 'admin',
      });
      clearAuth();
      expect(getUser()).toBeNull();
      expect(isAuthenticated()).toBe(false);
    });
  });
});
