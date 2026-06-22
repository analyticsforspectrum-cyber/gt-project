import { IsBoolean, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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

  /** Agar true bo'lsa sessiya saqlanmaydi — faqat invoicelar generatsiya qilinadi */
  @IsOptional()
  @IsBoolean()
  skipSession?: boolean;
}
