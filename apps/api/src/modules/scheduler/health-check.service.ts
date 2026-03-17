import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatasourceService } from '@/modules/datasource/datasource.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';

@Injectable()
export class HealthCheckService {
  private readonly logger = new Logger(HealthCheckService.name);

  constructor(
    private readonly datasourceService: DatasourceService,
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
  ) {}

  @Cron('0 */30 * * * *')
  async handleHealthCheck(): Promise<void> {
    this.logger.log('Starting scheduled health check for all datasources');

    // Get all non-deleted datasources
    const datasources = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('ds.deleted_at IS NULL')
      .getMany();

    if (datasources.length === 0) {
      this.logger.log('No datasources to check');
      return;
    }

    // Test all datasources in parallel
    const results = await Promise.allSettled(
      datasources.map(async (ds) => {
        try {
          await this.datasourceService.testConnection(ds.id);
          return { id: ds.id, name: ds.name, success: true };
        } catch (error) {
          this.logger.error(
            `Health check failed for datasource ${ds.name} (${ds.id}): ${error}`,
          );
          return { id: ds.id, name: ds.name, success: false };
        }
      }),
    );

    const successful = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success,
    ).length;
    const failed = results.length - successful;

    this.logger.log(
      `Health check completed: ${successful} succeeded, ${failed} failed out of ${datasources.length} datasources`,
    );
  }
}
