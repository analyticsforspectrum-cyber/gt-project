import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vazvrat, VazvratSchema } from './schemas/vazvrat.schema';
import { VazvratController } from './vazvrat.controller';
import { VazvratService } from './vazvrat.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Vazvrat.name, schema: VazvratSchema }])],
  controllers: [VazvratController],
  providers: [VazvratService]
})
export class VazvratModule {}
