import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InventoryMovement, InventoryMovementDocument } from './schemas/movement.schema';

@Injectable()
export class InventoryService {
  constructor(@InjectModel(InventoryMovement.name) private readonly movementModel: Model<InventoryMovementDocument>) {}

  async recordMovement(input: {
    dateIso: string;
    productSku: string;
    movementType: 'import' | 'invoice' | 'manual_adjustment' | 'order_fulfillment';
    quantity: number;
    userId: string;
    reference: string;
  }): Promise<InventoryMovement> {
    return this.movementModel.create(input);
  }

  // Explicit return type: the inferred lean type is too large for TS to serialize (TS7056).
  async list(): Promise<(InventoryMovement & { id: string })[]> {
    // `.lean()` skips hydration for this read-only list; re-attach the `id` virtual
    // the web client keys movement rows on (lean drops virtuals).
    const docs = await this.movementModel
      .find()
      .sort({ dateIso: -1, createdAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return docs.map((doc) => ({ ...doc, id: String(doc._id) })) as unknown as (InventoryMovement & { id: string })[];
  }
}
