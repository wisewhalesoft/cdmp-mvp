import { Injectable } from '@nestjs/common';

export interface ConnectionTestResult {
  success: boolean;
  responseTimeMs: number;
  errorMessage?: string;
  errorCode?: string;
}

export const CONNECTION_TESTER = 'CONNECTION_TESTER';

export interface IConnectionTester {
  testConnection(config: {
    type: 'mysql' | 'postgresql' | 'sqlserver';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }): Promise<ConnectionTestResult>;
}

@Injectable()
export class ConnectionTesterProvider implements IConnectionTester {
  async testConnection(config: {
    type: 'mysql' | 'postgresql' | 'sqlserver';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      switch (config.type) {
        case 'mysql':
          return await this.testMysql(config, startTime);
        case 'postgresql':
          return await this.testPostgresql(config, startTime);
        case 'sqlserver':
          return await this.testSqlServer(config, startTime);
        default:
          return {
            success: false,
            responseTimeMs: Date.now() - startTime,
            errorMessage: `不支援的資料庫類型: ${config.type}`,
          };
      }
    } catch (err: any) {
      return this.handleError(err, startTime, config.type);
    }
  }

  private async testMysql(
    config: { host: string; port: number; database: string; username: string; password: string },
    startTime: number,
  ): Promise<ConnectionTestResult> {
    let connection: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mysql2 = require('mysql2/promise');
      connection = await mysql2.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        connectTimeout: 10000,
      });
      await connection.ping();
      return { success: true, responseTimeMs: Date.now() - startTime };
    } catch (err: any) {
      return this.handleError(err, startTime, 'mysql');
    } finally {
      if (connection) {
        try { await connection.end(); } catch { /* ignore */ }
      }
    }
  }

  private async testPostgresql(
    config: { host: string; port: number; database: string; username: string; password: string },
    startTime: number,
  ): Promise<ConnectionTestResult> {
    let client: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg');
      client = new Client({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        connectionTimeoutMillis: 10000,
      });
      await client.connect();
      await client.query('SELECT 1');
      return { success: true, responseTimeMs: Date.now() - startTime };
    } catch (err: any) {
      return this.handleError(err, startTime, 'postgresql');
    } finally {
      if (client) {
        try { await client.end(); } catch { /* ignore */ }
      }
    }
  }

  private async testSqlServer(
    config: { host: string; port: number; database: string; username: string; password: string },
    startTime: number,
  ): Promise<ConnectionTestResult> {
    let pool: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mssql = require('mssql');
      const mssqlConfig = {
        server: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectTimeout: 10000,
        },
      };
      pool = await mssql.connect(mssqlConfig);
      await pool.request().query('SELECT 1');
      return { success: true, responseTimeMs: Date.now() - startTime };
    } catch (err: any) {
      return this.handleError(err, startTime, 'sqlserver');
    } finally {
      if (pool) {
        try { await pool.close(); } catch { /* ignore */ }
      }
    }
  }

  private handleError(err: any, startTime: number, dbType: string): ConnectionTestResult {
    const responseTimeMs = Date.now() - startTime;
    const code = err.code || err.number || '';
    const message = err.message || String(err);

    // Timeout detection
    if (
      code === 'ETIMEDOUT' ||
      code === 'ESOCKET' ||
      message.includes('timeout') ||
      message.includes('ETIMEDOUT')
    ) {
      return {
        success: false,
        responseTimeMs,
        errorMessage: '連線逾時',
        errorCode: 'DS_CONNECTION_TIMEOUT',
      };
    }

    // Host unreachable
    if (
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN' ||
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED')
    ) {
      return {
        success: false,
        responseTimeMs,
        errorMessage: '無法連線至主機',
        errorCode: 'DS_HOST_UNREACHABLE',
      };
    }

    // Auth failure
    if (
      code === 'ER_ACCESS_DENIED_ERROR' ||    // MySQL
      code === '28P01' ||                       // PostgreSQL
      code === 'ELOGIN' ||                      // SQL Server
      message.includes('Access denied') ||
      message.includes('password authentication failed') ||
      message.includes('Login failed')
    ) {
      return {
        success: false,
        responseTimeMs,
        errorMessage: '帳號或密碼錯誤',
        errorCode: 'DS_AUTH_FAILED',
      };
    }

    // Database not found
    if (
      code === 'ER_BAD_DB_ERROR' ||            // MySQL
      code === '3D000' ||                       // PostgreSQL
      message.includes('database') && message.includes('does not exist') ||
      message.includes('Unknown database')
    ) {
      return {
        success: false,
        responseTimeMs,
        errorMessage: '找不到指定的資料庫',
        errorCode: 'DS_DATABASE_NOT_FOUND',
      };
    }

    // Generic failure
    return {
      success: false,
      responseTimeMs,
      errorMessage: `連線失敗: ${message}`,
      errorCode: 'DS_CONNECTION_FAILED',
    };
  }
}
