import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export type AuditAction =
  | 'login'
  | 'logout'
  | 'invoice_created'
  | 'invoice_edited'
  | 'invoice_deleted'
  | 'order_created'
  | 'order_updated'
  | 'product_added'
  | 'product_updated'
  | 'product_deleted'
  | 'import_performed';

@Schema({ timestamps: true, toJSON: { virtuals: true, versionKey: false }, toObject: { virtuals: true } })
export class AuditLog {
  @Prop({ required: true, trim: true })
  userId: string;

  @Prop({ required: true, trim: true })
  userName: string;

  @Prop({ required: true, trim: true })
  action: AuditAction;

  @Prop({ required: true, trim: true })
  entity: string;

  @Prop({ type: Object })
  oldValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;

  @Prop({ required: true, trim: true })
  ipAddress: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Audit history is browsed newest-first and filtered by user/action; without
// these the unbounded log forces a full collection scan on every read.
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
