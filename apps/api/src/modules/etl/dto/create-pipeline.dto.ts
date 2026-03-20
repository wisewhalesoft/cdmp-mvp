import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePipelineDto {
  @IsNotEmpty({ message: '此欄位為必填' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  schedule?: string | null;
}
