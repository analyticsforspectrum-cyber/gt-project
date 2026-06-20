import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PublicUser } from '../users/users.types';
import { SaveSessionDto } from './dto/save-session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  list() {
    return this.sessionsService.list();
  }

  @Get(':invoiceDate')
  get(@Param('invoiceDate') invoiceDate: string) {
    return this.sessionsService.get(invoiceDate);
  }

  @Post()
  save(@Body() dto: SaveSessionDto, @CurrentUser() user: PublicUser) {
    return this.sessionsService.save(dto, user);
  }

  @Delete(':invoiceDate')
  remove(@Param('invoiceDate') invoiceDate: string) {
    return this.sessionsService.remove(invoiceDate);
  }
}
