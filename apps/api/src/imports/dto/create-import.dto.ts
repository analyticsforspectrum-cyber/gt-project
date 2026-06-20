import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateImportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  importedRecords: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  errors: number;

  @IsOptional()
  @IsArray()
  errorDetails?: Record<string, unknown>[];

  @IsOptional()
  @IsIn(['pending', 'completed', 'failed'])
  status?: 'pending' | 'completed' | 'failed';
}
