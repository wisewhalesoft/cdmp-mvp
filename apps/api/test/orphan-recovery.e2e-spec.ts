import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { OrphanRecoveryService } from '@/modules/orphan-recovery/orphan-recovery.service';
import { OrphanRecoveryModule } from '@/modules/orphan-recovery/orphan-recovery.module';
import { HashUtil } from '@/common/hash/hash.util';

const ALL_ENTITIES = [
  User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog,
  ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog, EtlPipelineVersion,
];

const TEST_AES_KEY = randomBytes(32).toString('hex');
const ADMIN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DS_ID = 'd1d2d3d4-e5f6-7890-abcd-ef1234567890';

describe('OrphanRecovery E2E (F038)', () => {
  let dataSource: DataSource;
  let service: OrphanRecoveryService;
  let taskRepo: Repository<ExtractionTask>;
  let logRepo: Repository<ExtractionLog>;
  let pipelineRepo: Repository<EtlPipeline>;
  let pipelineLogRepo: Repository<EtlPipelineLog>;
  let module: TestingModule;

  beforeAll(async () => {
    process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-jwt-secret',
              AES_ENCRYPTION_KEY: TEST_AES_KEY,
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ALL_ENTITIES,
          synchronize: true,
        }),
        OrphanRecoveryModule,
      ],
    }).compile();

    dataSource = module.get(DataSource);
    service = module.get(OrphanRecoveryService);
    taskRepo = dataSource.getRepository(ExtractionTask);
    logRepo = dataSource.getRepository(ExtractionLog);
    pipelineRepo = dataSource.getRepository(EtlPipeline);
    pipelineLogRepo = dataSource.getRepository(EtlPipelineLog);

    // Seed admin user + datasource
    const userRepo = dataSource.getRepository(User);
    await userRepo.save({
      id: ADMIN_ID,
      name: 'Admin',
      email: 'admin@test.com',
      password_hash: await HashUtil.hash('P@ssw0rd123'),
      role: 'admin',
      status: 'active',
    });

    const dsRepo = dataSource.getRepository(Datasource);
    await dsRepo.save({
      id: DS_ID,
      name: 'Test DS',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database_name: 'test',
      username: 'test',
      encrypted_password: 'encrypted',
      status: 'unknown',
      created_by: ADMIN_ID,
    });
  });

  afterAll(async () => {
    await module?.close();
  });

  beforeEach(async () => {
    // Clean extraction & pipeline data between tests
    await pipelineLogRepo.query('DELETE FROM etl_pipeline_logs');
    await pipelineRepo.query('DELETE FROM etl_pipelines');
    await logRepo.query('DELETE FROM extraction_logs');
    await taskRepo.query('DELETE FROM extraction_tasks');
  });

  // ── E04 Integration ──────────────────────────────────────

  describe('E04 擷取任務回收 (Integration)', () => {
    it('TS-F038-028: 回收後 extraction_tasks.status = failed, error_message 正確', async () => {
      // 預置孤兒任務
      await taskRepo.save({
        name: '和潤小車客戶主檔擷取',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'running',
        source_table: 'customers',
        schedule: '0 * * * *',
        created_by: ADMIN_ID,
      });

      await service.onApplicationBootstrap();

      const tasks = await taskRepo.find();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].error_message).toBe('系統重啟，任務執行中斷，請重新觸發執行');
    });

    it('TS-F038-029: 對應 extraction_logs 同步修復', async () => {
      const task = await taskRepo.save({
        name: '孤兒任務',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'running',
        source_table: 'orders',
        schedule: '0 * * * *',
        created_by: ADMIN_ID,
      });

      await logRepo.save({
        task_id: task.id,
        status: 'running',
        started_at: new Date(Date.now() - 60000),
        triggered_by: 'manual',
        created_by: ADMIN_ID,
      });

      await service.onApplicationBootstrap();

      const logs = await logRepo.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('failed');
      expect(logs[0].finished_at).not.toBeNull();
      expect(logs[0].error_message).toBe('系統重啟，執行進程被中斷');
    });

    it('TS-F038-030: 多筆孤兒任務批次回收', async () => {
      for (let i = 0; i < 3; i++) {
        await taskRepo.save({
          name: `孤兒任務-${i}`,
          datasource_id: DS_ID,
          mode: 'full',
          status: 'running',
          source_table: `table_${i}`,
          schedule: '0 * * * *',
          created_by: ADMIN_ID,
        });
      }

      await service.onApplicationBootstrap();

      const tasks = await taskRepo.find();
      expect(tasks).toHaveLength(3);
      tasks.forEach((t) => {
        expect(t.status).toBe('failed');
      });
    });

    it('TS-F038-031: 已軟刪除的 running 任務不被回收', async () => {
      await taskRepo.save({
        name: '已刪除的 running 任務',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'running',
        source_table: 'deleted_table',
        schedule: '0 * * * *',
        created_by: ADMIN_ID,
        deleted_at: new Date(),
      });

      await service.onApplicationBootstrap();

      const tasks = await taskRepo.find();
      expect(tasks).toHaveLength(1);
      // 狀態不應被改變
      expect(tasks[0].status).toBe('running');
    });

    it('TS-F038-032: completed/failed 任務不被影響', async () => {
      const completedTask = await taskRepo.save({
        name: 'A-completed-task',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'completed',
        source_table: 'completed_table',
        schedule: '0 * * * *',
        created_by: ADMIN_ID,
      });

      const failedTask = await taskRepo.save({
        name: 'B-failed-task',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'failed',
        source_table: 'failed_table',
        schedule: '0 * * * *',
        error_message: '原始錯誤',
        created_by: ADMIN_ID,
      });

      await service.onApplicationBootstrap();

      const completed = await taskRepo.findOneBy({ id: completedTask.id });
      const failed = await taskRepo.findOneBy({ id: failedTask.id });
      expect(completed!.status).toBe('completed');
      expect(failed!.status).toBe('failed');
      expect(failed!.error_message).toBe('原始錯誤');
    });
  });

  // ── E05 Integration ──────────────────────────────────────

  describe('E05 ETL Pipeline 回收 (Integration)', () => {
    it('TS-F038-033: 回收後 etl_pipelines.status = failed', async () => {
      await pipelineRepo.save({
        name: '孤兒 Pipeline',
        status: 'running',
        created_by: ADMIN_ID,
      });

      await service.onApplicationBootstrap();

      const pipelines = await pipelineRepo.find();
      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].status).toBe('failed');
    });

    it('TS-F038-034: etl_pipeline_logs 修復含 finished_at 和 duration_ms', async () => {
      const pipeline = await pipelineRepo.save({
        name: '孤兒 Pipeline',
        status: 'running',
        created_by: ADMIN_ID,
      });

      await pipelineLogRepo.save({
        pipeline_id: pipeline.id,
        version: 1,
        status: 'running',
        started_at: new Date(Date.now() - 30000),
        triggered_by: 'manual',
        is_test_run: false,
        created_by: ADMIN_ID,
      });

      await service.onApplicationBootstrap();

      const logs = await pipelineLogRepo.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('failed');
      expect(logs[0].finished_at).not.toBeNull();
      expect(logs[0].duration_ms).not.toBeNull();
      expect(logs[0].error_message).toBe('系統重啟，Pipeline 執行進程被中斷');
    });

    it('TS-F038-035: 已軟刪除的 running Pipeline 不被回收', async () => {
      await pipelineRepo.save({
        name: '已刪除 Pipeline',
        status: 'running',
        created_by: ADMIN_ID,
        deleted_at: new Date(),
      });

      await service.onApplicationBootstrap();

      const pipelines = await pipelineRepo.find();
      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].status).toBe('running');
    });
  });

  // ── 無孤兒場景 (Integration) ──────────────────────────────

  describe('無孤兒場景 (Integration)', () => {
    it('TS-F038-037: 無孤兒時正常完成不報錯', async () => {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  // ── 冪等性 (Integration) ─────────────────────────────────

  describe('冪等性 (Integration)', () => {
    it('TS-F038-044: 連續執行兩次，第二次無副作用', async () => {
      await taskRepo.save({
        name: '孤兒任務',
        datasource_id: DS_ID,
        mode: 'full',
        status: 'running',
        source_table: 'test',
        schedule: '0 * * * *',
        created_by: ADMIN_ID,
      });

      // 第一次回收
      await service.onApplicationBootstrap();
      const afterFirst = await taskRepo.find();
      expect(afterFirst[0].status).toBe('failed');

      // 第二次回收 — 不應有變化
      await service.onApplicationBootstrap();
      const afterSecond = await taskRepo.find();
      expect(afterSecond[0].status).toBe('failed');
      expect(afterSecond[0].error_message).toBe('系統重啟，任務執行中斷，請重新觸發執行');
    });
  });
});
