import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../schemas/invoice.schema';

class InvoiceItemUpdateDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsNumber()
  qty: number;

  @IsNumber()
  price: number;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsNotEmpty()
  order?: string;

  @IsOptional()
  @IsNotEmpty()
  storeCode?: string;

  @IsOptional()
  @IsNotEmpty()
  short?: string;

  @IsOptional()
  @IsNumber()
  seq?: number;

  @IsOptional()
  @IsNotEmpty()
  market?: string;

  @IsOptional()
  @IsNotEmpty()
  label?: string;

  @IsOptional()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsDateString()
  dateIso?: string;

  @IsOptional()
  @IsBoolean()
  manual?: boolean;

  @IsOptional()
  @IsEnum(['draft', 'saved', 'delivered', 'cancelled'])
  status?: InvoiceStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemUpdateDto)
  lines?: InvoiceItemUpdateDto[];
}
