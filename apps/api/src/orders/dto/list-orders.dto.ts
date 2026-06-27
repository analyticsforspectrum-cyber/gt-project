import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

export class ListOrdersDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customer?: string;

  @IsOptional()
  @IsIn(['new', 'in_production', 'delivered', 'cancelled'])
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
