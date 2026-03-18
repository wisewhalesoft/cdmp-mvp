import { IsBoolean } from 'class-validator';

export class ToggleExtractionTaskDto {
  @IsBoolean({ message: 'enabled 必須為布林值' })
  enabled: boolean;
}
