import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutorFactory } from '../executor-factory';
import { MySQLExecutor } from '../mysql-executor';
import { PostgreSQLExecutor } from '../postgresql-executor';
import { MSSQLExecutor } from '../mssql-executor';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';

describe('ExecutorFactory', () => {
  let factory: ExecutorFactory;
  let mockRepo: Partial<Repository<Datasource>>;

  beforeEach(() => {
    mockRepo = {} as Partial<Repository<Datasource>>;
    factory = new ExecutorFactory(mockRepo as Repository<Datasource>);
  });

  it('should return MySQLExecutor for type "mysql"', () => {
    const executor = factory.getExecutor('mysql');
    expect(executor).toBeInstanceOf(MySQLExecutor);
  });

  it('should return PostgreSQLExecutor for type "postgresql"', () => {
    const executor = factory.getExecutor('postgresql');
    expect(executor).toBeInstanceOf(PostgreSQLExecutor);
  });

  it('should return MSSQLExecutor for type "sqlserver"', () => {
    const executor = factory.getExecutor('sqlserver');
    expect(executor).toBeInstanceOf(MSSQLExecutor);
  });

  it('should return MSSQLExecutor for type "mssql"', () => {
    const executor = factory.getExecutor('mssql');
    expect(executor).toBeInstanceOf(MSSQLExecutor);
  });

  it('should throw for unsupported datasource type', () => {
    expect(() => factory.getExecutor('oracle')).toThrow('Unsupported datasource type: oracle');
  });

  it('should cache and return the same executor instance for same type', () => {
    const first = factory.getExecutor('mysql');
    const second = factory.getExecutor('mysql');
    expect(first).toBe(second);
  });

  it('should return different instances for different types', () => {
    const mysql = factory.getExecutor('mysql');
    const pg = factory.getExecutor('postgresql');
    expect(mysql).not.toBe(pg);
  });
});
