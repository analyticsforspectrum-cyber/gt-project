import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ _id: false })
export class SessionVersion {
  @Prop({ required: true })
  savedAt: Date;

  @Prop({ required: true })
  invoiceCount: number;

  @Prop({ required: true })
  sumTotal: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  savedBy?: Types.ObjectId;
}

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, index: true })
  invoiceDate: string;

  @Prop({ required: true })
  savedAt: Date;

  @Prop({ required: true })
  invoiceCount: number;

  @Prop({ required: true })
  sumTotal: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot: Record<string, unknown>;

  @Prop({ type: [SessionVersion], default: [] })
  versions: SessionVersion[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  savedBy?: Types.ObjectId;

  /** Unique session name, e.g. "2026-06-21 #1". Required for multi-session-per-day. */
  @Prop({ default: '' })
  name: string;

  /** Soft delete: set when admin deletes a session (goes to Arxiv) */
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  deletedBy?: Types.ObjectId | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
// Compound unique: one session per date+name pair
SessionSchema.index({ invoiceDate: 1, name: 1 }, { unique: true });
