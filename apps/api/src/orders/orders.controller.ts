import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicUser } from '../users/users.types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customer') customer?: string,
    @Query('status') status?: string
  ) {
    return this.ordersService.list({ dateFrom, dateTo, customer, status });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: PublicUser) {
    return this.ordersService.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: PublicUser) {
    return this.ordersService.update(id, dto, user.id);
  }

  @Patch(':id/deliver')
  deliver(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.ordersService.update(id, { status: 'delivered' }, user.id);
  }
}
