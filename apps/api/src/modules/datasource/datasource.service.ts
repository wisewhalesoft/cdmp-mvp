import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CreateDatasourceDto } from './dto/create-datasource.dto';
import { ListDatasourceDto } from './dto/list-datasource.dto';

export interface DatasourceListItemResult {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  description: string | null;
  status: string;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasourceListResult {
  data: DatasourceListItemResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateDatasourceResult {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  description: string | null;
  status: string;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DatasourceService {
  constructor(
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
  ) {}

  async findAll(query: ListDatasourceDto): Promise<DatasourceListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.datasourceRepository.createQueryBuilder('ds');

    qb.andWhere('ds.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('LOWER(ds.name) LIKE :search', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    if (query.type) {
      qb.andWhere('ds.type = :type', { type: query.type });
    }

    if (query.status) {
      qb.andWhere('ds.status = :status', { status: query.status });
    }

    qb.orderBy('ds.created_at', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((ds) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
        host: ds.host,
        port: ds.port,
        databaseName: ds.database_name,
        username: ds.username,
        description: ds.description,
        status: ds.status,
        lastTestedAt: ds.last_tested_at,
        createdAt: ds.created_at,
        updatedAt: ds.updated_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createDatasource(
    dto: CreateDatasourceDto,
    userId: string,
  ): Promise<CreateDatasourceResult> {
    // Case-insensitive name uniqueness check (exclude soft-deleted)
    const existing = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('LOWER(ds.name) = LOWER(:name)', { name: dto.name })
      .andWhere('ds.deleted_at IS NULL')
      .getOne();

    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.DS_NAME_EXISTS,
        message: ERROR_MESSAGES.DS_NAME_EXISTS,
      });
    }

    // Encrypt password
    const encryptedPassword = CryptoUtil.encrypt(dto.password);

    // Create and save datasource
    const datasource = this.datasourceRepository.create({
      name: dto.name,
      type: dto.type,
      host: dto.host,
      port: dto.port,
      database_name: dto.databaseName,
      username: dto.username,
      encrypted_password: encryptedPassword,
      description: dto.description ?? null,
      status: 'unknown',
      last_tested_at: null,
      created_by: userId,
    });

    const saved = await this.datasourceRepository.save(datasource);

    return {
      id: saved.id,
      name: saved.name,
      type: saved.type,
      host: saved.host,
      port: saved.port,
      databaseName: saved.database_name,
      username: saved.username,
      description: saved.description,
      status: saved.status,
      lastTestedAt: saved.last_tested_at,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    };
  }
}
