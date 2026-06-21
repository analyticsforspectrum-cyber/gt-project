import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class VazvratItemDto {
  @IsISO8601({ strict: false }) date: string;
  @IsOptional() @IsString() marketCode?: string;
  @IsOptional() @IsString() marketName?: string;
  @IsString() sapCode: string;
  @IsOptional() @IsString() productName?: string;
  @IsNumber() @Type(() => Number) qty: number;
  @IsOptional() @IsNumber() @Type(() => Number) pricePerUnit?: number;
  @IsNumber() @Type(() => Number) totalWithVat: number;
  @IsOptional() @IsString() orderNo?: string;
}

export class UploadVazvratDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VazvratItemDto)
  records: VazvratItemDto[];
}
