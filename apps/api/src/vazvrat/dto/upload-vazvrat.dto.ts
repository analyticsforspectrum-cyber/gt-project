import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsNumber, IsString, ValidateNested } from 'class-validator';

export class VazvratItemDto {
  @IsISO8601({ strict: false }) date: string;
  @IsString() marketCode: string;
  @IsString() marketName: string;
  @IsString() sapCode: string;
  @IsString() productName: string;
  @IsNumber() @Type(() => Number) qty: number;
  @IsNumber() @Type(() => Number) pricePerUnit: number;
  @IsNumber() @Type(() => Number) totalWithVat: number;
  @IsString() orderNo: string;
}

export class UploadVazvratDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VazvratItemDto)
  records: VazvratItemDto[];
}
