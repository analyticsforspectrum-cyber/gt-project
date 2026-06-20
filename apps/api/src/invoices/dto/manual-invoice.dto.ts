import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

class ManualQuantityDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  qty: number;

  /** Optional pre-VAT price override. If omitted, catalog price is used. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;
}

export class ManualInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  storeCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  storeName: string;

  @IsOptional()
  @IsString()
  @MaxLength(360)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  order?: string;

  @IsISO8601({ strict: true })
  dateIso: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualQuantityDto)
  quantities: ManualQuantityDto[];
}
