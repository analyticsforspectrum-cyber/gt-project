import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Requisites, RequisitesSchema } from './schemas/requisites.schema';
import { RequisitesController } from './requisites.controller';
import { RequisitesService } from './requisites.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Requisites.name, schema: RequisitesSchema }])],
  controllers: [RequisitesController],
  providers: [RequisitesService],
  exports: [RequisitesService]
})
export class RequisitesModule {}
