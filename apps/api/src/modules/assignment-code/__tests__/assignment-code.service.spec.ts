/**
 * F068：AssignmentCodeService Unit Tests
 *
 * 採 mocked repository（純 unit），17 cases 涵蓋：
 *
 * A. tbl_id 白名單驗證（5 cases）
 *   1. 拒絕未在白名單的 tbl_id（CASEYEAR）→ 422 CODE_TYPE_INVALID
 *   2. 拒絕未在白名單的 tbl_id（'01' 舊系統數字碼）→ 422 CODE_TYPE_INVALID
 *   3. PROD_KIND 通過
 *   4. SPEC_TP 通過
 *   5. CASE_STATUS 通過
 *
 * B. listCodes（3 cases）
 *   6. includeInactive=false 過濾掉已過期
 *   7. includeInactive=true 回傳全部
 *   8. 回傳 active 計算欄位（stadt <= today <= enddt）
 *
 * C. createCode（4 cases）
 *   9. 寫入 ob_code_df 並 system_id 固定 'OB'
 *  10. 重複 tbl_cd → 422 CODE_IN_USE，訊息含 tblCd / tblId
 *  11. stadt 省略時填 Asia/Taipei today
 *  12. 寫入 audit log（CREATE / actor_id / before_value=null）
 *
 * D. updateCode（2 cases）
 *  13. 找不到紀錄 → 404 CODE_NOT_FOUND
 *  14. audit log 記 before / after snapshot
 *
 * E. disableCode（2 cases）
 *  15. enddt 設為 today (Taipei)，OQ-F068-03
 *  16. audit log action='DISABLE'
 *
 * F. Asia/Taipei today helper（1 case）
 *  17. UTC + 8h 計算 YYYYMMDD（不依賴本機 TZ）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  AssignmentCodeService,
  ALLOWED_TBL_IDS,
  SYSTEM_ID,
  ENDDT_INFINITE,
} from '../assignment-code.service';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';

describe('AssignmentCodeService', () => {
  let service: AssignmentCodeService;
  let codeRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let auditRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let userRepo: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const actor = { userId: 'actor-uuid', ipAddress: '127.0.0.1' };
  const TODAY = AssignmentCodeService.getTodayYmdInTaipei();

  beforeEach(async () => {
    codeRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data) => ({ ...data })),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    auditRepo = {
      create: vi.fn((data) => ({ ...data })),
      save: vi.fn((entity) => Promise.resolve(entity)),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: actor.userId, name: 'Tester' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentCodeService,
        { provide: getRepositoryToken(ObCodeDf), useValue: codeRepo },
        { provide: getRepositoryToken(AssignmentAuditLog), useValue: auditRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<AssignmentCodeService>(AssignmentCodeService);
  });

  // ===== A. tbl_id 白名單驗證 =====

  it('1) 拒絕 CASEYEAR → 422 CODE_TYPE_INVALID', async () => {
    await expect(service.listCodes('CASEYEAR', false)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    try {
      await service.listCodes('CASEYEAR', false);
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({ error: 'CODE_TYPE_INVALID' });
    }
  });

  it("2) 拒絕 '01' 舊系統數字碼 → 422 CODE_TYPE_INVALID", async () => {
    await expect(service.listCodes('01', false)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('3) PROD_KIND 通過 listCodes', async () => {
    codeRepo.find.mockResolvedValue([]);
    const result = await service.listCodes('PROD_KIND', false);
    expect(result.tblId).toBe('PROD_KIND');
  });

  it('4) SPEC_TP 通過 listCodes', async () => {
    codeRepo.find.mockResolvedValue([]);
    const result = await service.listCodes('SPEC_TP', false);
    expect(result.tblId).toBe('SPEC_TP');
  });

  it('5) CASE_STATUS 通過 listCodes', async () => {
    codeRepo.find.mockResolvedValue([]);
    const result = await service.listCodes('CASE_STATUS', false);
    expect(result.tblId).toBe('CASE_STATUS');
  });

  // ===== B. listCodes =====

  it('6) includeInactive=false 過濾掉已過期', async () => {
    codeRepo.find.mockResolvedValue([
      { tbl_cd: '01', tbl_desc1: 'Active', tbl_desc2: null, stadt: '20200101', enddt: ENDDT_INFINITE },
      { tbl_cd: '02', tbl_desc1: 'Expired', tbl_desc2: null, stadt: '20200101', enddt: '20200201' },
    ]);
    const result = await service.listCodes('PROD_KIND', false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].tblCd).toBe('01');
  });

  it('7) includeInactive=true 回傳全部紀錄（含 expired）', async () => {
    codeRepo.find.mockResolvedValue([
      { tbl_cd: '01', tbl_desc1: 'Active', tbl_desc2: null, stadt: '20200101', enddt: ENDDT_INFINITE },
      { tbl_cd: '02', tbl_desc1: 'Expired', tbl_desc2: null, stadt: '20200101', enddt: '20200201' },
    ]);
    const result = await service.listCodes('PROD_KIND', true);
    expect(result.data).toHaveLength(2);
    expect(result.data.find((d) => d.tblCd === '02')?.active).toBe(false);
  });

  it('8) 回傳 active 計算欄位（stadt <= today <= enddt）', async () => {
    codeRepo.find.mockResolvedValue([
      { tbl_cd: '01', tbl_desc1: 'X', tbl_desc2: null, stadt: '20200101', enddt: ENDDT_INFINITE },
      { tbl_cd: '02', tbl_desc1: 'Future', tbl_desc2: null, stadt: '29991231', enddt: ENDDT_INFINITE },
    ]);
    const result = await service.listCodes('PROD_KIND', true);
    const active = result.data.find((d) => d.tblCd === '01');
    const future = result.data.find((d) => d.tblCd === '02');
    expect(active?.active).toBe(true);
    expect(future?.active).toBe(false);
  });

  // ===== C. createCode =====

  it('9) 寫入 ob_code_df，system_id 固定 OB', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    await service.createCode(
      { tblId: 'PROD_KIND', tblCd: '05', tblDesc1: '商用車' },
      actor,
    );
    const created = codeRepo.create.mock.calls[0][0];
    expect(created.system_id).toBe(SYSTEM_ID);
    expect(created.tbl_id).toBe('PROD_KIND');
    expect(created.tbl_cd).toBe('05');
    expect(created.tbl_desc1).toBe('商用車');
    expect(created.enddt).toBe(ENDDT_INFINITE);
  });

  it('10) 重複 tbl_cd → 422 CODE_IN_USE，訊息含 tblCd / tblId', async () => {
    codeRepo.findOne.mockResolvedValue({
      tbl_cd: '01',
      tbl_desc1: 'Existing',
      stadt: '20200101',
      enddt: ENDDT_INFINITE,
    });
    await expect(
      service.createCode(
        { tblId: 'PROD_KIND', tblCd: '01', tblDesc1: '重複' },
        actor,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.createCode(
        { tblId: 'PROD_KIND', tblCd: '01', tblDesc1: '重複' },
        actor,
      );
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.error).toBe('CODE_IN_USE');
      expect(body.message).toContain('01');
      expect(body.message).toContain('PROD_KIND');
    }
  });

  it('11) stadt 省略時填 Asia/Taipei today', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    await service.createCode(
      { tblId: 'PROD_KIND', tblCd: '05', tblDesc1: 'X' },
      actor,
    );
    const created = codeRepo.create.mock.calls[0][0];
    expect(created.stadt).toBe(TODAY);
  });

  it('12) 寫入 audit log（CREATE / actor_id / before_value=null）', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    await service.createCode(
      { tblId: 'PROD_KIND', tblCd: '05', tblDesc1: 'X' },
      actor,
    );
    expect(auditRepo.create).toHaveBeenCalledTimes(1);
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('CREATE');
    expect(log.entity_type).toBe('ob_code_df');
    expect(log.entity_id).toBe('PROD_KIND:05');
    expect(log.actor_id).toBe(actor.userId);
    expect(log.actor_name).toBe('Tester');
    expect(log.before_value).toBeNull();
    expect(log.after_value).toMatchObject({ tbl_desc1: 'X' });
    expect(log.ip_address).toBe('127.0.0.1');
  });

  // ===== D. updateCode =====

  it('13) 找不到紀錄 → 404 CODE_NOT_FOUND', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    await expect(
      service.updateCode('PROD_KIND', '99', { tblDesc1: '新名稱' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    try {
      await service.updateCode('PROD_KIND', '99', { tblDesc1: 'X' }, actor);
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({ error: 'CODE_NOT_FOUND' });
    }
  });

  it('14) audit log 記 before / after snapshot', async () => {
    codeRepo.findOne.mockResolvedValue({
      system_id: SYSTEM_ID,
      tbl_id: 'PROD_KIND',
      tbl_cd: '01',
      tbl_desc1: '舊名',
      tbl_desc2: null,
      stadt: '20200101',
      enddt: ENDDT_INFINITE,
    });
    await service.updateCode(
      'PROD_KIND',
      '01',
      { tblDesc1: '新名' },
      actor,
    );
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('UPDATE');
    expect(log.before_value).toMatchObject({ tbl_desc1: '舊名' });
    expect(log.after_value).toMatchObject({ tbl_desc1: '新名' });
  });

  // ===== E. disableCode =====

  it('15) enddt 設為 today (Taipei) — OQ-F068-03', async () => {
    codeRepo.findOne.mockResolvedValue({
      system_id: SYSTEM_ID,
      tbl_id: 'PROD_KIND',
      tbl_cd: '01',
      tbl_desc1: 'X',
      tbl_desc2: null,
      stadt: '20200101',
      enddt: ENDDT_INFINITE,
    });
    await service.disableCode('PROD_KIND', '01', actor);
    const saved = codeRepo.save.mock.calls[0][0];
    expect(saved.enddt).toBe(TODAY);
  });

  it('16) audit log action=DISABLE', async () => {
    codeRepo.findOne.mockResolvedValue({
      system_id: SYSTEM_ID,
      tbl_id: 'PROD_KIND',
      tbl_cd: '01',
      tbl_desc1: 'X',
      tbl_desc2: null,
      stadt: '20200101',
      enddt: ENDDT_INFINITE,
    });
    await service.disableCode('PROD_KIND', '01', actor);
    const log = auditRepo.create.mock.calls[0][0];
    expect(log.action).toBe('DISABLE');
    expect(log.before_value).toMatchObject({ enddt: ENDDT_INFINITE });
    expect(log.after_value).toMatchObject({ enddt: TODAY });
  });

  // ===== F. Asia/Taipei today helper =====

  it('17) Asia/Taipei today YYYYMMDD（UTC+8 計算，無 DST）', () => {
    // 2026-05-13 16:00 UTC == 2026-05-14 00:00 Asia/Taipei
    // 採固定 input Date 不依本機 TZ
    const utc = new Date(Date.UTC(2026, 4, 13, 16, 0, 0)); // 月份 0-index
    const taipei = AssignmentCodeService.getTodayYmdInTaipei(utc);
    expect(taipei).toBe('20260514');

    // 2026-05-13 15:59 UTC == 2026-05-13 23:59 Asia/Taipei
    const utcBefore = new Date(Date.UTC(2026, 4, 13, 15, 59, 0));
    expect(AssignmentCodeService.getTodayYmdInTaipei(utcBefore)).toBe('20260513');
  });

  // 額外健康度檢查：白名單暴露符合期待
  it('ALLOWED_TBL_IDS = [PROD_KIND, SPEC_TP, CASE_STATUS]', () => {
    expect(ALLOWED_TBL_IDS).toEqual(['PROD_KIND', 'SPEC_TP', 'CASE_STATUS']);
  });
});
