import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateRequisitesDto } from './dto/update-requisites.dto';
import { RequisitesService } from './requisites.service';

@Controller('requisites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequisitesController {
  constructor(private readonly requisitesService: RequisitesService) {}

  @Get()
  get() {
    return this.requisitesService.get();
  }

  @Put()
  @Roles('admin')
  update(@Body() dto: UpdateRequisitesDto) {
    return this.requisitesService.update(dto);
  }

  @Post('reset')
  @Roles('admin')
  reset() {
    return this.requisitesService.reset();
  }
}
