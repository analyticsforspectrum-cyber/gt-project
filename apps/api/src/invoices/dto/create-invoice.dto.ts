import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsObject, ValidateNested } from 'class-validator';

class InvoiceItemDto {
  @IsNotEmpty()
  sku: string;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  unit: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  price: number;
}

export class CreateInvoiceDto {
  @IsNumber()
  invNo: number;

  @IsNotEmpty()
  order: string;

  @IsNotEmpty()
  storeCode: string;

  @IsNotEmpty()
  short: string;

  @IsNumber()
  seq: number;

  @IsNotEmpty()
  market: string;

  @IsNotEmpty()
  label: string;

  @IsNotEmpty()
  address: string;

  @IsDateString()
  dateIso: string;

  @IsBoolean()
  manual: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  lines: InvoiceItemDto[];
}
