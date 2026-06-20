import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PublicUser } from '../users/users.types';
import { UploadVazvratDto } from './dto/upload-vazvrat.dto';
import { VazvratService } from './vazvrat.service';

@Controller('vazvrat')
@UseGuards(JwtAuthGuard)
export class VazvratController {
  constructor(private readonly vazvratService: VazvratService) {}

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
}
