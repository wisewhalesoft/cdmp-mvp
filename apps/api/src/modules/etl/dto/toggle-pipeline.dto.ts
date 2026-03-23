import { IsBoolean } from 'class-validator';

export class TogglePipelineDto {
  @IsBoolean()
  enabled: boolean;
}
