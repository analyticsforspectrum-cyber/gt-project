import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export type MovementType = 'import' | 'invoice' | 'manual_adjustment' | 'order_fulfillment';

export class CreateMovementDto {
  @IsISO8601({ strict: true })
  dateIso: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  productSku: string;

  @IsIn(['import', 'invoice', 'manual_adjustment', 'order_fulfillment'])
  movementType: MovementType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reference: string;
}
