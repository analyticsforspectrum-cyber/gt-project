import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PublicUser } from '../users/users.types';
import { SaveSessionDto } from './dto/save-session.dto';
import { Session, SessionDocument } from './schemas/session.schema';

@Injectable()
export class SessionsService {
  constructor(@InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>) {}

  async list() {
    return this.sessionModel
      .find()
      .sort({ invoiceDate: -1 })
      .select('invoiceDate savedAt invoiceCount sumTotal versions savedBy updatedAt name')
      .lean()
      .exec();
  }

  async get(invoiceDate: string) {
    const session = await this.sessionModel.findOne({ invoiceDate }).lean().exec();
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async save(dto: SaveSessionDto, user: PublicUser) {
    const previous = await this.sessionModel.findOne({ invoiceDate: dto.invoiceDate }).lean().exec();
    const versions = previous
      ? [
          {
            savedAt: previous.savedAt,
            invoiceCount: previous.invoiceCount,
            sumTotal: previous.sumTotal,
            snapshot: previous.snapshot,
            savedBy: previous.savedBy
          },
          ...((previous.versions || []) as unknown[])
        ].slice(0, 9)
      : [];

    return this.sessionModel
      .findOneAndUpdate(
        { invoiceDate: dto.invoiceDate },
        {
          $set: {
            savedAt: new Date(),
            invoiceCount: dto.invoiceCount,
            sumTotal: dto.sumTotal,
            snapshot: dto.snapshot,
            versions,
            savedBy: new Types.ObjectId(user.id),
            ...(dto.name !== undefined ? { name: dto.name } : {})
          }
        },
        { new: true, upsert: true }
      )
      .lean()
      .exec();
  }

  async remove(invoiceDate: string): Promise<{ ok: true }> {
    const result = await this.sessionModel.deleteOne({ invoiceDate }).exec();
    if (!result.deletedCount) throw new NotFoundException('Session not found');
    return { ok: true };
  }
}
