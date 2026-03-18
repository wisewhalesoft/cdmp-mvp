import { IsIn } from 'class-validator';

export class RunExtractionTaskDto {
  @IsIn(['manual', 'retry'], { message: 'triggeredBy 必須為 manual 或 retry' })
  triggeredBy: 'manual' | 'retry';
}
