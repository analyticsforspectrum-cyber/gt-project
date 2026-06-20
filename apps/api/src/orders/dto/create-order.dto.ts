import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, ValidateNested } from 'class-validator';

class OrderItemDto {
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

export class CreateOrderDto {
  @IsNotEmpty()
  customer: string;

  @IsDateString()
  deliveryDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsNotEmpty()
  notes?: string;
}
