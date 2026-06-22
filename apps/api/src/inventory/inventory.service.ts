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

  async list(): Promise<InventoryMovement[]> {
    return this.movementModel.find().sort({ dateIso: -1, createdAt: -1 }).limit(200).exec();
  }
}
