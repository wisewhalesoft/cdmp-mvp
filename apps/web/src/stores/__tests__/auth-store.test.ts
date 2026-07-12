import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUser,
  getUserRole,
  getIsSalesManager,
  setAuth,
  clearAuth,
  isAuthenticated,
  defaultHomePathFor,
  getDefaultHomePath,
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

  // F002 v2.1.0 / US-177 / F111：角色感知登入後預設導向（§4.5 矩陣 / BR-Redirect）
  describe('defaultHomePathFor (pure function)', () => {
    it('admin → /（帳號管理）', () => {
      expect(defaultHomePathFor('admin')).toBe('/');
    });

    it('director（業務部長）→ /assignment/overview（分派總覽）', () => {
      expect(defaultHomePathFor('director')).toBe('/assignment/overview');
    });

    it('section_chief（業務處長）→ /assignment/overview（分派總覽）', () => {
      expect(defaultHomePathFor('section_chief')).toBe('/assignment/overview');
    });

    it('user（一般使用者）→ /c360/customers（Customer 360）', () => {
      expect(defaultHomePathFor('user')).toBe('/c360/customers');
    });
  });

  describe('getDefaultHomePath (store wrapper — 讀取當前登入身份)', () => {
    it('admin 登入後 → /', () => {
      setAuth('tok', {
        id: 'a1',
        name: 'Admin',
        email: 'admin@cdmp.test',
        role: 'admin',
      });
      expect(getDefaultHomePath()).toBe('/');
    });

    it('director 登入後 → /assignment/overview', () => {
      setAuth('tok', {
        id: 'd1',
        name: 'Director',
        email: 'director@cdmp.test',
        role: 'user',
        businessRole: 'director',
      });
      expect(getDefaultHomePath()).toBe('/assignment/overview');
    });

    it('section_chief 登入後 → /assignment/overview', () => {
      setAuth('tok', {
        id: 's1',
        name: 'SectionChief',
        email: 'chief@cdmp.test',
        role: 'user',
        businessRole: 'section_chief',
      });
      expect(getDefaultHomePath()).toBe('/assignment/overview');
    });

    it('一般使用者（businessRole=null）登入後 → /c360/customers', () => {
      setAuth('tok', {
        id: 'u1',
        name: 'User',
        email: 'user@cdmp.test',
        role: 'user',
        businessRole: null,
      });
      expect(getDefaultHomePath()).toBe('/c360/customers');
    });

    it('legacy JWT（無 businessRole 欄位）登入後 → 保守視為一般使用者 /c360/customers', () => {
      setAuth('tok', {
        id: 'u9',
        name: 'Legacy',
        email: 'legacy@cdmp.test',
        role: 'user',
      });
      expect(getDefaultHomePath()).toBe('/c360/customers');
    });

    it('未登入 → 保守回傳 /c360/customers（getEffectiveIdentity 預設 user）', () => {
      expect(getDefaultHomePath()).toBe('/c360/customers');
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
