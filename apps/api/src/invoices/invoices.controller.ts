import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PublicUser } from '../users/users.types';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { ManualInvoiceDto } from './dto/manual-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UndeliverDto } from './dto/undeliver.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(
    @Query('dateIso') dateIso?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const safePage  = Math.max(1, parseInt(page  ?? '1',  10) || 1);
    const safeLimit = Math.min(500, Math.max(1, parseInt(limit ?? '200', 10) || 200));
    return this.invoicesService.list(dateIso, safePage, safeLimit);
  }

  @Get('cancelled')
  listCancelled() {
    return this.invoicesService.listCancelled();
  }

  @Get(':invNo')
  get(@Param('invNo') invNo: string) {
    return this.invoicesService.findOne(Number(invNo));
  }

  /** Generate invoices — admin only */
  @Post('generate')
  @Roles('admin')
  generate(@Body() dto: GenerateInvoicesDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.generate(dto, user);
  }

  /** Manual invoice — admin only */
  @Post('manual')
  @Roles('admin')
  async manual(@Body() dto: ManualInvoiceDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.manual(dto, user);
  }

  /** Update invoice — admin only */
  @Patch(':invNo')
  @Roles('admin')
  update(@Param('invNo') invNo: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: PublicUser) {
    return this.invoicesService.update(Number(invNo), dto as any, user);
  }

  /** Soft delete — admin only */
  @Delete(':invNo')
  @Roles('admin')
  remove(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.softDelete(Number(invNo), user);
  }

  /** Restore from Arxiv — admin only */
  @Patch(':invNo/restore')
  @Roles('admin')
  restore(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.restore(Number(invNo), user);
  }

  /** Hard delete (permanent) — admin only */
  @Delete(':invNo/hard')
  @Roles('admin')
  hardDelete(@Param('invNo') invNo: string) {
    return this.invoicesService.hardDelete(Number(invNo));
  }

  /** Mark delivered — admin only */
  @Patch(':invNo/deliver')
  @Roles('admin')
  deliver(@Param('invNo') invNo: string, @CurrentUser() user: PublicUser) {
    return this.invoicesService.setStatus(Number(invNo), 'delivered', user);
  }

  /** Undeliver — admin only */
  @Patch(':invNo/undeliver')
  @Roles('admin')
  undeliver(
    @Param('invNo') invNo: string,
    @Body() dto: UndeliverDto,
    @CurrentUser() user: PublicUser
  ) {
    return this.invoicesService.undeliver(Number(invNo), dto.comment, user);
  }
}
