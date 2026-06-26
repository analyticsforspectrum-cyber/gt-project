import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PublicUser } from '../users/users.types';
import { UploadVazvratDto } from './dto/upload-vazvrat.dto';
import { VazvratService } from './vazvrat.service';

@Controller('vazvrat')
@UseGuards(JwtAuthGuard)
export class VazvratController {
  constructor(private readonly vazvratService: VazvratService) {}

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('upload')
  upload(@Body() dto: UploadVazvratDto, @CurrentUser() user: PublicUser) {
    return this.vazvratService.upload(dto, user);
  }

  @Get()
  query(@Query('from') from: string, @Query('to') to: string) {
    return this.vazvratService.query(from, to);
  }

  @Get('dates')
  dates() {
    return this.vazvratService.dates();
  }

  @Get('analytics')
  analytics(@Query('from') from: string, @Query('to') to: string) {
    return this.vazvratService.analytics(from, to);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('by-date/:date')
  deleteByDate(@Param('date') date: string) {
    return this.vazvratService.deleteByDate(date);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('all')
  deleteAll() {
    return this.vazvratService.deleteAll();
  }

  /** Delete multiple dates at once */
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('delete-dates')
  deleteByDates(@Body() body: { dates: string[] }) {
    return this.vazvratService.deleteByDates(body.dates);
  }
}
