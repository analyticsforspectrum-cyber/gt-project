import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicUser } from '../users/users.types';
import { CreateMovementDto } from './dto/create-movement.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('movements')
  listMovements() {
    return this.inventoryService.list();
  }

  @Post('movements')
  @UseGuards(RolesGuard)
  @Roles('admin')
  createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: PublicUser) {
    return this.inventoryService.recordMovement({
      ...dto,
      userId: user.id
    });
  }
}
