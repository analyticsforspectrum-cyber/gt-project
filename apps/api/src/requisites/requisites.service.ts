import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_REQUISITES } from './default-requisites';
import { UpdateRequisitesDto } from './dto/update-requisites.dto';
import { Requisites, RequisitesDocument } from './schemas/requisites.schema';

@Injectable()
export class RequisitesService implements OnModuleInit {
  constructor(
    @InjectModel(Requisites.name) private readonly requisitesModel: Model<RequisitesDocument>
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.requisitesModel.findOne({ key: 'default' }).exec();
    if (!existing) {
      await this.requisitesModel.create({ key: 'default', ...DEFAULT_REQUISITES });
    }
  }

  async get() {
    return this.requisitesModel.findOne({ key: 'default' }).lean().exec();
  }

  async update(dto: UpdateRequisitesDto) {
    return this.requisitesModel
      .findOneAndUpdate({ key: 'default' }, { $set: dto }, { new: true, upsert: true })
      .lean()
      .exec();
  }

  async reset() {
    return this.update(DEFAULT_REQUISITES);
  }
}
