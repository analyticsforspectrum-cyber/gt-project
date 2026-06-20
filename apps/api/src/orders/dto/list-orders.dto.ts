import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
