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
  @Prop({ required: true, unique: true, index: true })
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

  @Prop({ default: '' })
  name?: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
