import { IsString, MaxLength } from 'class-validator';

export class UndeliverDto {
  @IsString()
  @MaxLength(500)
  comment: string;
}
