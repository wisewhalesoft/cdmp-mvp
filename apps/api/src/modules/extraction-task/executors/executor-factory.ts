import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { IExtractionExecutor } from '../extraction-executor.provider';
import { MySQLExecutor } from './mysql-executor';
import { PostgreSQLExecutor } from './postgresql-executor';
import { MSSQLExecutor } from './mssql-executor';

/**
 * ExecutorFactory: creates database-specific executor instances based on datasource type.
 * Each executor creates a temporary connection per call and disconnects immediately after.
 */
@Injectable()
export class ExecutorFactory {
  private readonly executors: Map<string, IExtractionExecutor> = new Map();

  constructor(
    private readonly datasourceRepository: Repository<Datasource>,
  ) {}

  /**
   * Get the appropriate executor for a given datasource type.
   * Executors are cached per type since they are stateless (connection is per-call).
   */
  getExecutor(datasourceType: string): IExtractionExecutor {
    const cached = this.executors.get(datasourceType);
    if (cached) return cached;

    let executor: IExtractionExecutor;

    switch (datasourceType) {
      case 'mysql':
        executor = new MySQLExecutor(this.datasourceRepository);
        break;
      case 'postgresql':
        executor = new PostgreSQLExecutor(this.datasourceRepository);
        break;
      case 'sqlserver':
      case 'mssql':
        executor = new MSSQLExecutor(this.datasourceRepository);
        break;
      default:
        throw new Error(`Unsupported datasource type: ${datasourceType}`);
    }

    this.executors.set(datasourceType, executor);
    return executor;
  }
}
