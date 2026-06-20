import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';

class SupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(360)
  addr: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  inn: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  vat: string;
}

class ReceiverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  inn: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  vat: string;
}

export class UpdateRequisitesDto {
  @ValidateNested()
  @Type(() => SupplierDto)
  supplier: SupplierDto;

  @ValidateNested()
  @Type(() => ReceiverDto)
  receiver: ReceiverDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  contract: string;
}
