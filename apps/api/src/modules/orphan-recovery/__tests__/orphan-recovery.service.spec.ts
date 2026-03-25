import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrphanRecoveryService } from '../orphan-recovery.service';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';

// ── Helpers ──────────────────────────────────────────────────

function makeTaskQb(orphanTasks: Partial<ExtractionTask>[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(orphanTasks),
  };
}

function makePipelineQb(orphanPipelines: Partial<EtlPipeline>[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(orphanPipelines),
  };
}

function makeUpdateQb() {
  return {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereInIds: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

// ── Test Suite ───────────────────────────────────────────────

describe('OrphanRecoveryService', () => {
  let service: OrphanRecoveryService;

  let taskQb: ReturnType<typeof makeTaskQb>;
  let pipelineQb: ReturnType<typeof makePipelineQb>;
  let managerUpdateQb: ReturnType<typeof makeUpdateQb>;
  let transactionFn: ReturnType<typeof vi.fn>;

  const mockTaskRepo = { createQueryBuilder: vi.fn() };
  const mockLogRepo = { createQueryBuilder: vi.fn() };
  const mockPipelineRepo = { createQueryBuilder: vi.fn() };
  const mockPipelineLogRepo = { createQueryBuilder: vi.fn() };

  beforeEach(async () => {
    taskQb = makeTaskQb();
    pipelineQb = makePipelineQb();
    managerUpdateQb = makeUpdateQb();

    mockTaskRepo.createQueryBuilder.mockReturnValue(taskQb);
    mockPipelineRepo.createQueryBuilder.mockReturnValue(pipelineQb);

    transactionFn = vi.fn().mockImplementation(async (cb: any) => {
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      return cb(manager);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrphanRecoveryService,
        { provide: getRepositoryToken(ExtractionTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(ExtractionLog), useValue: mockLogRepo },
        { provide: getRepositoryToken(EtlPipeline), useValue: mockPipelineRepo },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mockPipelineLogRepo },
        { provide: DataSource, useValue: { transaction: transactionFn, options: { type: 'postgres' } } },
      ],
    }).compile();

    service = module.get<OrphanRecoveryService>(OrphanRecoveryService);
  });

  // ── E04 擷取任務回收 ─────────────────────────────────────

  describe('E04 擷取任務回收', () => {
    it('TS-F038-001: 有孤兒擷取任務時，批次更新 status 為 failed', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }, { id: 'task-2' }]);

      await service.onApplicationBootstrap();

      expect(transactionFn).toHaveBeenCalled();
      // 第一次 transaction 呼叫 → E04
      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      // update 被呼叫（task update + log update = 至少 2 次）
      expect(manager.createQueryBuilder).toHaveBeenCalled();
      expect(managerUpdateQb.update).toHaveBeenCalled();
      expect(managerUpdateQb.set).toHaveBeenCalled();
    });

    it('TS-F038-002: error_message 填入標準化訊息', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }]);

      await service.onApplicationBootstrap();

      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      // 驗證 set 呼叫中包含 error_message
      const firstSetCall = managerUpdateQb.set.mock.calls[0][0];
      expect(firstSetCall.status).toBe('failed');
      expect(firstSetCall.error_message).toBe('系統重啟，任務執行中斷，請重新觸發執行');
    });

    it('TS-F038-003: 對應 extraction_logs 同步更新為 failed', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }]);

      await service.onApplicationBootstrap();

      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      // 應呼叫 2 次 createQueryBuilder（task update + log update）
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2);

      // 第二次 set 呼叫是 log 更新
      const logSetCall = managerUpdateQb.set.mock.calls[1][0];
      expect(logSetCall.status).toBe('failed');
      expect(logSetCall.error_message).toBe('系統重啟，執行進程被中斷');
    });

    it('TS-F038-004: 多筆孤兒任務批次回收', async () => {
      const orphans = [{ id: 'task-1' }, { id: 'task-2' }, { id: 'task-3' }];
      taskQb.getMany.mockResolvedValue(orphans);

      await service.onApplicationBootstrap();

      // whereInIds 應接收 3 個 ID
      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      expect(managerUpdateQb.whereInIds).toHaveBeenCalledWith(['task-1', 'task-2', 'task-3']);
    });

    it('TS-F038-005: 已軟刪除的 running 任務不被回收', async () => {
      // 查詢條件已包含 deleted_at IS NULL，所以 mock 回傳空陣列
      taskQb.getMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      // 驗證查詢時有設定 andWhere deleted_at IS NULL
      expect(taskQb.andWhere).toHaveBeenCalledWith('task.deleted_at IS NULL');
    });
  });

  // ── E05 ETL Pipeline 回收 ────────────────────────────────

  describe('E05 ETL Pipeline 回收', () => {
    it('TS-F038-009: 有孤兒 Pipeline 時，status 更新為 failed', async () => {
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      await service.onApplicationBootstrap();

      // E04 沒有孤兒 → 不呼叫 transaction
      // E05 有孤兒 → 呼叫 transaction
      expect(transactionFn).toHaveBeenCalledTimes(1);
    });

    it('TS-F038-010: etl_pipelines 不寫入 error_message', async () => {
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      await service.onApplicationBootstrap();

      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      // 第一次 set 是 pipeline update — 不應有 error_message
      const pipelineSetCall = managerUpdateQb.set.mock.calls[0][0];
      expect(pipelineSetCall.status).toBe('failed');
      expect(pipelineSetCall).not.toHaveProperty('error_message');
    });

    it('TS-F038-011: etl_pipeline_logs 的 duration_ms 使用 PostgreSQL 語法計算', async () => {
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      await service.onApplicationBootstrap();

      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      // 第二次 set 是 log update
      const logSetCall = managerUpdateQb.set.mock.calls[1][0];
      expect(logSetCall.status).toBe('failed');
      expect(logSetCall.error_message).toBe('系統重啟，Pipeline 執行進程被中斷');
      // duration_ms 應為 function expression
      expect(typeof logSetCall.duration_ms).toBe('function');
    });

    it('TS-F038-012: 多筆孤兒 Pipeline 批次回收', async () => {
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }, { id: 'pipe-2' }]);

      await service.onApplicationBootstrap();

      const managerCb = transactionFn.mock.calls[0][0];
      const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
      await managerCb(manager);

      expect(managerUpdateQb.whereInIds).toHaveBeenCalledWith(['pipe-1', 'pipe-2']);
    });

    it('TS-F038-013: 已軟刪除的 running Pipeline 不被回收', async () => {
      pipelineQb.getMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(pipelineQb.andWhere).toHaveBeenCalledWith('p.deleted_at IS NULL');
    });
  });

  // ── 無孤兒場景 ──────────────────────────────────────────

  describe('無孤兒場景', () => {
    it('TS-F038-016: 無任何 running 任務/Pipeline 時靜默通過', async () => {
      taskQb.getMany.mockResolvedValue([]);
      pipelineQb.getMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(transactionFn).not.toHaveBeenCalled();
    });

    it('TS-F038-017: Logger 記錄「無需修復」', async () => {
      taskQb.getMany.mockResolvedValue([]);
      pipelineQb.getMany.mockResolvedValue([]);

      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.onApplicationBootstrap();

      const logMessages = logSpy.mock.calls.map((c) => c[0]);
      expect(logMessages.some((m: string) => m.includes('擷取任務：無需修復'))).toBe(true);
      expect(logMessages.some((m: string) => m.includes('ETL Pipeline：無需修復'))).toBe(true);
    });
  });

  // ── Transaction 與錯誤處理 ─────────────────────────────

  describe('Transaction 與錯誤處理', () => {
    it('TS-F038-019: E04 回收失敗時不拋出例外，繼續執行 E05', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }]);
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      let callCount = 0;
      transactionFn.mockImplementation(async (cb: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('DB connection lost');
        }
        const manager = { createQueryBuilder: vi.fn().mockReturnValue(managerUpdateQb) };
        return cb(manager);
      });

      // 不應拋出例外
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

      // E05 的 transaction 仍然被呼叫
      expect(transactionFn).toHaveBeenCalledTimes(2);
    });

    it('TS-F038-020: E05 回收失敗時不拋出例外', async () => {
      taskQb.getMany.mockResolvedValue([]);
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      transactionFn.mockRejectedValue(new Error('DB error'));

      const errorSpy = vi.spyOn(service['logger'], 'error');

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      const errorMsg = errorSpy.mock.calls[0][0];
      expect(errorMsg).toContain('ETL Pipeline 回收失敗');
    });

    it('TS-F038-021: E04 回收失敗時 Logger.error 被呼叫', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }]);
      pipelineQb.getMany.mockResolvedValue([]);

      transactionFn.mockRejectedValueOnce(new Error('Transaction failed'));

      const errorSpy = vi.spyOn(service['logger'], 'error');

      await service.onApplicationBootstrap();

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain('擷取任務回收失敗');
    });
  });

  // ── Logger 驗證 ──────────────────────────────────────────

  describe('Logger 驗證', () => {
    it('TS-F038-024: 回收摘要包含數量與耗時', async () => {
      taskQb.getMany.mockResolvedValue([{ id: 'task-1' }, { id: 'task-2' }]);
      pipelineQb.getMany.mockResolvedValue([{ id: 'pipe-1' }]);

      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.onApplicationBootstrap();

      const summaryLog = logSpy.mock.calls.find((c) =>
        (c[0] as string).includes('孤兒任務回收完成'),
      );
      expect(summaryLog).toBeDefined();
      const msg = summaryLog![0] as string;
      expect(msg).toContain('擷取任務：修復 2/2');
      expect(msg).toContain('ETL Pipeline：修復 1/1');
      expect(msg).toMatch(/總耗時：\d+ms/);
    });
  });

  // ── 冪等性 ──────────────────────────────────────────────

  describe('冪等性', () => {
    it('TS-F038-027: 連續執行兩次，第二次無副作用', async () => {
      // 第一次有孤兒
      taskQb.getMany.mockResolvedValueOnce([{ id: 'task-1' }]);
      pipelineQb.getMany.mockResolvedValueOnce([]);

      await service.onApplicationBootstrap();
      expect(transactionFn).toHaveBeenCalledTimes(1);

      // 第二次無孤兒（已被回收）
      transactionFn.mockClear();
      taskQb.getMany.mockResolvedValueOnce([]);
      pipelineQb.getMany.mockResolvedValueOnce([]);

      await service.onApplicationBootstrap();
      expect(transactionFn).not.toHaveBeenCalled();
    });
  });
});
