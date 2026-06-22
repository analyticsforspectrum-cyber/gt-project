import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PublicUser } from '../users/users.types';
import { SaveSessionDto } from './dto/save-session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  list() {
    return this.sessionsService.list();
  }

  /** Soft-deleted sessions for Arxiv — admin only */
  @Get('deleted')
  @Roles('admin')
  listDeleted() {
    return this.sessionsService.listDeleted();
  }

  /** Check if date+name combo already exists */
  @Get('check-duplicate')
  checkDuplicate(@Query('invoiceDate') invoiceDate: string, @Query('name') name: string) {
    return this.sessionsService.checkDuplicate(
      String(invoiceDate).slice(0, 20),
      String(name).slice(0, 100),
    );
  }

  /** Get session by MongoDB _id */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.sessionsService.get(id);
  }

  @Post()
  save(@Body() dto: SaveSessionDto, @CurrentUser() user: PublicUser) {
    return this.sessionsService.save(dto, user);
  }

  /** Soft delete: move to Arxiv */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.sessionsService.softDelete(id, user);
  }

  /** Restore session from Arxiv — admin only */
  @Patch(':id/restore')
  @Roles('admin')
  restore(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.sessionsService.restore(id);
  }

  /** Hard delete from Arxiv (permanent) — admin only */
  @Delete(':id/hard')
  @Roles('admin')
  hardDelete(@Param('id') id: string) {
    return this.sessionsService.hardDelete(id);
  }
}
