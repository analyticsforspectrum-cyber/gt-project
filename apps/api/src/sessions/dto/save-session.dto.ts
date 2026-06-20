import { IsISO8601, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveSessionDto {
  @IsISO8601({ strict: true })
  invoiceDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  invoiceCount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sumTotal: number;

  @IsObject()
  snapshot: object;

  @IsOptional()
  @IsString()
  name?: string;
}
