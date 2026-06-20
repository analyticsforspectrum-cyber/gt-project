import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module';
import { SessionsModule } from '../sessions/sessions.module';
import { InvoiceEngineService } from './invoice-engine.service';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    CatalogModule,
    SessionsModule,
    MongooseModule.forFeature([{ name: Invoice.name, schema: InvoiceSchema }])
  ],
  controllers: [InvoicesController],
  providers: [InvoiceEngineService, InvoicesService],
  exports: [InvoiceEngineService, InvoicesService]
})
export class InvoicesModule {}
