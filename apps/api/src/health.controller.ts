import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: 'gde-tort-api',
      timestamp: new Date().toISOString()
    };
  }
}
