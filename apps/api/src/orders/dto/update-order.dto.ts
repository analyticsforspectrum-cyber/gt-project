import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, ValidateNested } from 'class-validator';

class OrderItemUpdateDto {
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

export class UpdateOrderDto {
  @IsOptional()
  @IsNotEmpty()
  customer?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsEnum(['new', 'in_production', 'delivered', 'cancelled'])
  status?: 'new' | 'in_production' | 'delivered' | 'cancelled';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemUpdateDto)
  items?: OrderItemUpdateDto[];

  @IsOptional()
  @IsNotEmpty()
  notes?: string;
}
