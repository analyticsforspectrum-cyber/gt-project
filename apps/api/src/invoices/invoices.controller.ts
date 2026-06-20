import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PublicUser } from '../users/users.types';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { ManualInvoiceDto } from './dto/manual-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UndeliverDto } from './dto/undeliver.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list() {
    return this.invoicesService.list();
  }

  @Get(':invNo')
  get(@Param('invNo') invNo: string) {
    return this.invoicesService.findOne(Number(invNo));
  }

  @Post('generate')
  generate(@Body() dto: GenerateInvoicesDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.generate(dto, user);
  }

  @Post('manual')
  manual(@Body() dto: ManualInvoiceDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.manual(dto, user);
  }

  @Patch(':invNo')
  update(@Param('invNo') invNo: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.update(Number(invNo), dto as any, user);
  }

  @Delete(':invNo')
  remove(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.softDelete(Number(invNo), user);
  }

  @Patch(':invNo/restore')
  restore(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.restore(Number(invNo), user);
  }

  @Patch(':invNo/deliver')
  deliver(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.setStatus(Number(invNo), 'delivered', user);
  }

  @Patch(':invNo/undeliver')
  undeliver(
    @Param('invNo') invNo: string,
    @Body() dto: UndeliverDto,
    @CurrentUser() user: PublicUser
  ) {
    return this.invoicesService.undeliver(Number(invNo), dto.comment, user);
  }
}
