import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PublicUser } from '../users/users.types';
import { SaveSessionDto } from './dto/save-session.dto';
import { Session, SessionDocument } from './schemas/session.schema';

@Injectable()
export class SessionsService {
  constructor(@InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>) {}

  /** Active sessions (not soft-deleted) */
  async list() {
    return this.sessionModel
      .find({ deletedAt: null })
      .sort({ invoiceDate: -1, savedAt: -1 })
      .select('invoiceDate savedAt invoiceCount sumTotal savedBy updatedAt name')
      .lean()
      .exec();
  }

  /** Soft-deleted sessions for Arxiv */
  async listDeleted() {
    return this.sessionModel
      .find({ deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 })
      .select('invoiceDate savedAt invoiceCount sumTotal savedBy updatedAt name deletedAt deletedBy')
      .lean()
      .exec();
  }

  /** Get single session by MongoDB _id */
  async get(id: string) {
    const session = await this.sessionModel.findById(id).lean().exec();
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /** Check if a session with given date+name already exists */
  async checkDuplicate(invoiceDate: string, name: string): Promise<{ exists: boolean; id?: string }> {
    const existing = await this.sessionModel.findOne({ invoiceDate, name, deletedAt: null }, { _id: 1 }).lean().exec();
    if (existing) return { exists: true, id: String(existing._id) };
    return { exists: false };
  }

  async save(dto: SaveSessionDto, user: PublicUser) {
    const name = (dto.name && dto.name.trim()) ? dto.name.trim() : dto.invoiceDate;
    const previous = await this.sessionModel.findOne({ invoiceDate: dto.invoiceDate, name }).lean().exec();
    const versions = previous
      ? [
          {
            savedAt: previous.savedAt,
            invoiceCount: previous.invoiceCount,
            sumTotal: previous.sumTotal,
            snapshot: previous.snapshot,
            savedBy: previous.savedBy,
          },
          ...((previous.versions || []) as unknown[]),
        ].slice(0, 9)
      : [];

    return this.sessionModel
      .findOneAndUpdate(
        { invoiceDate: dto.invoiceDate, name },
        {
          $set: {
            savedAt: new Date(),
            invoiceCount: dto.invoiceCount,
            sumTotal: dto.sumTotal,
            snapshot: dto.snapshot,
            versions,
            savedBy: new Types.ObjectId(user.id),
            name,
            deletedAt: null,
            deletedBy: null,
          },
        },
        { new: true, upsert: true }
      )
      .lean()
      .exec();
  }

  /** Soft delete: move to Arxiv */
  async softDelete(id: string, user: PublicUser): Promise<{ ok: true }> {
    const result = await this.sessionModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { deletedAt: new Date(), deletedBy: new Types.ObjectId(user.id) } }
    ).exec();
    if (!result.matchedCount) throw new NotFoundException('Session not found');
    return { ok: true };
  }

  /** Restore from Arxiv */
  async restore(id: string): Promise<{ ok: true }> {
    const result = await this.sessionModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { deletedAt: null, deletedBy: null } }
    ).exec();
    if (!result.matchedCount) throw new NotFoundException('Session not found');
    return { ok: true };
  }

  /** Hard delete from Arxiv (permanent) */
  async hardDelete(id: string): Promise<{ ok: true }> {
    const result = await this.sessionModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
    if (!result.deletedCount) throw new NotFoundException('Session not found');
    return { ok: true };
  }
}
