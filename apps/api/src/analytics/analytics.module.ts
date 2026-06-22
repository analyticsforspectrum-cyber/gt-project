import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { InventoryMovement, InventoryMovementSchema } from '../inventory/schemas/movement.schema';
import { Session, SessionSchema } from '../sessions/schemas/session.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      { name: Session.name, schema: SessionSchema }
    ])
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService]
})
export class AnalyticsModule {}
