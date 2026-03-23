import { Injectable, ConflictException, UnprocessableEntityException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { ListPipelineDto } from './dto/list-pipeline.dto';
import { ListPipelineLogsDto } from './dto/list-pipeline-logs.dto';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { SaveDefinitionDto } from './dto/save-definition.dto';

function getTodayRangeUTC() {
  const now = new Date();
  const taipeiOffset = 8 * 60 * 60 * 1000;
  const taipeiNow = new Date(now.getTime() + taipeiOffset);
  const taipeiTodayStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
  );
  const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
  return { todayStartUTC, tomorrowStartUTC };
}

@Injectable()
export class EtlPipelineService {
  constructor(
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineLog)
    private readonly logRepository: Repository<EtlPipelineLog>,
    @InjectRepository(EtlPipelineVersion)
    private readonly versionRepository: Repository<EtlPipelineVersion>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePipelineDto, userId: string) {
    // Validate cron expression if provided (BR-4: must be 5 or 6 fields)
    if (dto.schedule) {
      const fields = dto.schedule.trim().split(/\s+/).length;
      if (fields < 5 || fields > 6) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.VALIDATION_INVALID_CRON,
          message: ERROR_MESSAGES.VALIDATION_INVALID_CRON,
        });
      }
      try {
        CronExpressionParser.parse(dto.schedule, { tz: 'UTC' });
      } catch {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.VALIDATION_INVALID_CRON,
          message: ERROR_MESSAGES.VALIDATION_INVALID_CRON,
        });
      }
    }

    // Check name uniqueness (only among non-deleted)
    const existingPipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.name = :name', { name: dto.name })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (existingPipeline) {
      throw new ConflictException({
        error: ERROR_CODES.PIPELINE_NAME_EXISTS,
        message: ERROR_MESSAGES.PIPELINE_NAME_EXISTS,
      });
    }

    // Use transaction to create pipeline + initial version atomically
    return this.dataSource.transaction(async (manager) => {
      const pipelineRepo = manager.getRepository(EtlPipeline);
      const versionRepo = manager.getRepository(EtlPipelineVersion);

      const pipeline = pipelineRepo.create({
        name: dto.name,
        description: dto.description ?? null,
        schedule: dto.schedule ?? null,
        status: 'draft',
        version: 1,
        step_count: 0,
        enabled: false,
        processed_count: 0,
        avg_duration_ms: 0,
        execution_count: 0,
        created_by: userId,
      });
      const savedPipeline = await pipelineRepo.save(pipeline);

      // Create initial EtlPipelineVersion (v1, draft)
      const version = versionRepo.create({
        pipeline_id: savedPipeline.id,
        version: 1,
        status: 'draft',
        definition: { nodes: [], edges: [] },
        created_by: userId,
      });
      await versionRepo.save(version);

      return {
        id: savedPipeline.id,
        name: savedPipeline.name,
        description: savedPipeline.description,
        version: savedPipeline.version,
        stepCount: savedPipeline.step_count,
        status: savedPipeline.status,
        schedule: savedPipeline.schedule,
        enabled: savedPipeline.enabled,
        createdBy: savedPipeline.created_by,
        createdAt: savedPipeline.created_at.toISOString(),
        updatedAt: savedPipeline.updated_at.toISOString(),
      };
    });
  }

  async getStats() {
    const baseQb = () =>
      this.pipelineRepository
        .createQueryBuilder('p')
        .where('p.deleted_at IS NULL');

    const total = await baseQb().getCount();

    const active = await baseQb()
      .andWhere('p.status = :s', { s: 'active' })
      .getCount();

    const running = await baseQb()
      .andWhere('p.status = :s', { s: 'running' })
      .getCount();

    const draft = await baseQb()
      .andWhere('p.status = :s', { s: 'draft' })
      .getCount();

    // todayProcessed: SUM of processed_count from pipeline logs for today (UTC+8)
    const { todayStartUTC, tomorrowStartUTC } = getTodayRangeUTC();

    const result = await this.logRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(log.processed_count), 0)', 'total')
      .where('log.started_at >= :start', { start: todayStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .getRawOne();

    const todayProcessed = Number(result?.total ?? 0);

    return { total, active, running, draft, todayProcessed };
  }

  async findAll(query: ListPipelineDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.pipelineRepository
      .createQueryBuilder('p')
      .leftJoin('p.creator', 'user')
      .addSelect(['user.name'])
      .where('p.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }

    if (query.keyword) {
      qb.andWhere('LOWER(p.name) LIKE :keyword', {
        keyword: `%${query.keyword.toLowerCase()}%`,
      });
    }

    qb.orderBy('p.created_at', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [pipelines, total] = await qb.getManyAndCount();
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const data = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      stepCount: p.step_count,
      status: p.status,
      schedule: p.schedule,
      lastExecutionAt: p.last_execution_at?.toISOString() ?? null,
      nextExecutionAt: p.next_execution_at?.toISOString() ?? null,
      processedCount: p.processed_count,
      createdBy: p.creator?.name ?? '',
      createdAt: p.created_at.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async getDefinition(pipelineId: string) {
    // Find pipeline (not soft-deleted)
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    // Get latest version
    const version = await this.versionRepository.findOne({
      where: { pipeline_id: pipelineId },
      order: { version: 'DESC' },
    });

    return {
      versionId: version!.id,
      version: version!.version,
      status: version!.status,
      definition: version!.definition,
    };
  }

  async saveDefinition(pipelineId: string, dto: SaveDefinitionDto) {
    // Find pipeline (not soft-deleted)
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    // Validate connections
    this.validateConnections(dto.definition);

    // Validate duplicate extract sources
    this.validateDuplicateExtractSources(dto.definition.nodes);

    // Get current version
    const version = await this.versionRepository.findOne({
      where: { pipeline_id: pipelineId },
      order: { version: 'DESC' },
    });

    // Update version definition
    version!.definition = dto.definition;
    if (dto.changeSummary !== undefined) {
      version!.change_summary = dto.changeSummary;
    }
    await this.versionRepository.save(version!);

    // Update pipeline step_count (BR-6)
    const stepCount = dto.definition.nodes.length;
    pipeline.step_count = stepCount;
    await this.pipelineRepository.save(pipeline);

    return {
      message: 'Pipeline 定義已儲存',
      versionId: version!.id,
      version: version!.version,
      stepCount,
    };
  }

  async togglePipeline(pipelineId: string, enabled: boolean) {
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    if (enabled) {
      // Check if there's a published version
      const publishedVersion = await this.versionRepository.findOne({
        where: { pipeline_id: pipelineId, status: 'published' },
      });

      if (!publishedVersion) {
        throw new BadRequestException({
          error: ERROR_CODES.PIPELINE_DRAFT_CANNOT_ENABLE,
          message: ERROR_MESSAGES.PIPELINE_DRAFT_CANNOT_ENABLE,
        });
      }

      pipeline.enabled = true;
      pipeline.status = 'active';
    } else {
      pipeline.enabled = false;
      pipeline.status = 'disabled';
    }

    const saved = await this.pipelineRepository.save(pipeline);

    return {
      id: saved.id,
      name: saved.name,
      status: saved.status,
      enabled: saved.enabled,
      schedule: saved.schedule,
      updatedAt: saved.updated_at.toISOString(),
    };
  }

  async publishVersion(pipelineId: string, versionId: string) {
    // 1. Validate pipeline exists and not soft-deleted
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    // 2. Validate version exists
    const version = await this.versionRepository.findOne({
      where: { id: versionId },
    });

    if (!version || version.pipeline_id !== pipelineId) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_VERSION_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_VERSION_NOT_FOUND,
      });
    }

    // 3. Validate version status
    if (version.status === 'draft') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.PIPELINE_PUBLISH_REQUIRES_TEST,
        message: ERROR_MESSAGES.PIPELINE_PUBLISH_REQUIRES_TEST,
      });
    }

    if (version.status === 'published') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.PIPELINE_VERSION_ALREADY_PUBLISHED,
        message: ERROR_MESSAGES.PIPELINE_VERSION_ALREADY_PUBLISHED,
      });
    }

    // 4. Execute in transaction
    try {
      const publishedAt = new Date();

      await this.dataSource.transaction(async (manager) => {
        const versionRepo = manager.getRepository(EtlPipelineVersion);
        const pipelineRepo = manager.getRepository(EtlPipeline);

        version.status = 'published';
        version.published_at = publishedAt;
        await versionRepo.save(version);

        pipeline.version = version.version;
        await pipelineRepo.save(pipeline);
      });

      return {
        id: version.id,
        pipelineId: version.pipeline_id,
        version: version.version,
        status: version.status as 'published',
        changeSummary: version.change_summary,
        publishedAt: publishedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException({
        error: ERROR_CODES.SYSTEM_INTERNAL_ERROR,
        message: ERROR_MESSAGES.SYSTEM_INTERNAL_ERROR,
      });
    }
  }

  async getPipelineLogs(pipelineId: string, query: ListPipelineLogsDto) {
    // Check pipeline exists (including soft-deleted for BR-5)
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.logRepository
      .createQueryBuilder('log')
      .where('log.pipeline_id = :pipelineId', { pipelineId })
      .orderBy('log.started_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [logs, total] = await qb.getManyAndCount();
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const data = logs.map((log) => ({
      id: log.id,
      version: log.version,
      status: log.status,
      startedAt: log.started_at instanceof Date ? log.started_at.toISOString() : log.started_at,
      finishedAt: log.finished_at
        ? (log.finished_at instanceof Date ? log.finished_at.toISOString() : log.finished_at)
        : null,
      durationMs: log.duration_ms,
      processedCount: log.processed_count,
      triggeredBy: log.triggered_by,
      isTestRun: log.is_test_run,
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async getLogDetail(logId: string) {
    const log = await this.logRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.pipeline', 'pipeline')
      .where('log.id = :logId', { logId })
      .getOne();

    if (!log) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_LOG_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_LOG_NOT_FOUND,
      });
    }

    let nodeLogs: any[] = [];
    if (log.node_logs) {
      try {
        nodeLogs = typeof log.node_logs === 'string'
          ? JSON.parse(log.node_logs)
          : log.node_logs;
      } catch {
        nodeLogs = [];
      }
    }

    return {
      id: log.id,
      pipelineId: log.pipeline_id,
      pipelineName: log.pipeline?.name ?? '',
      version: log.version,
      status: log.status,
      startedAt: log.started_at instanceof Date ? log.started_at.toISOString() : log.started_at,
      finishedAt: log.finished_at
        ? (log.finished_at instanceof Date ? log.finished_at.toISOString() : log.finished_at)
        : null,
      durationMs: log.duration_ms,
      processedCount: log.processed_count,
      errorMessage: log.error_message,
      triggeredBy: log.triggered_by,
      isTestRun: log.is_test_run,
      nodeLogs,
    };
  }

  private getNodeCategory(nodeType: string): 'extract' | 'transform' | 'load' {
    if (nodeType === 'extract') return 'extract';
    if (nodeType === 'load') return 'load';
    return 'transform'; // All transform-* types
  }

  private validateConnections(definition: { nodes: any[]; edges: any[] }) {
    const { nodes, edges } = definition;
    if (!edges || edges.length === 0) return;

    // Build node type map
    const nodeTypeMap = new Map<string, string>();
    for (const node of nodes) {
      nodeTypeMap.set(node.id, node.type);
    }

    // Connection rules validation (BR-2, BR-3, BR-4)
    for (const edge of edges) {
      const sourceType = nodeTypeMap.get(edge.source);
      const targetType = nodeTypeMap.get(edge.target);
      if (!sourceType || !targetType) continue;

      const sourceCat = this.getNodeCategory(sourceType);
      const targetCat = this.getNodeCategory(targetType);

      // BR-4: Load is terminal - cannot connect to anything
      if (sourceCat === 'load') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PIPELINE_INVALID_CONNECTION,
          message: ERROR_MESSAGES.PIPELINE_INVALID_CONNECTION,
        });
      }

      // BR-2: Extract can only connect to Transform
      if (sourceCat === 'extract' && targetCat !== 'transform') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PIPELINE_INVALID_CONNECTION,
          message: ERROR_MESSAGES.PIPELINE_INVALID_CONNECTION,
        });
      }

      // BR-3: Transform can connect to Transform or Load (not Extract)
      if (sourceCat === 'transform' && targetCat === 'extract') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PIPELINE_INVALID_CONNECTION,
          message: ERROR_MESSAGES.PIPELINE_INVALID_CONNECTION,
        });
      }
    }

    // BR-5: Cycle detection
    this.detectCycle(nodes, edges);
  }

  private detectCycle(nodes: any[], edges: any[]) {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of edges) {
      const targets = adjacency.get(edge.source);
      if (targets) targets.push(edge.target);
    }

    // DFS-based cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (hasCycle(neighbor)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (hasCycle(node.id)) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PIPELINE_INVALID_CONNECTION,
          message: `${ERROR_MESSAGES.PIPELINE_INVALID_CONNECTION}：偵測到循環連線`,
        });
      }
    }
  }

  private validateDuplicateExtractSources(nodes: any[]) {
    const extractNodes = nodes.filter((n) => n.type === 'extract');
    const rawTableIds = extractNodes
      .map((n) => n.data?.rawTableId)
      .filter((id) => id != null && id !== '');

    const seen = new Set<string>();
    for (const rawTableId of rawTableIds) {
      if (seen.has(rawTableId)) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PIPELINE_INVALID_CONNECTION,
          message: `${ERROR_MESSAGES.PIPELINE_INVALID_CONNECTION}：重複來源`,
        });
      }
      seen.add(rawTableId);
    }
  }
}
