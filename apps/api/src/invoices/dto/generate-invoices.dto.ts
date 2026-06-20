import { IsISO8601, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateInvoicesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500000)
  sapRaw: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startId: number;

  @IsISO8601({ strict: true })
  dateIso: string;
}
