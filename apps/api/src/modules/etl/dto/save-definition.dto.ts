import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveDefinitionDto {
  @IsNotEmpty()
  @IsObject()
  definition: { nodes: any[]; edges: any[] };

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}
