import { Body, BadRequestException, Controller, Get, Post, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { Request } from 'express';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicUser } from '../users/users.types';
import { AuditService } from '../audit/audit.service';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  list() {
    return this.importsService.list();
  }

  @Post()
  create(@Body() dto: CreateImportDto, @CurrentUser() user: PublicUser) {
    return this.importsService.create({
      ...dto,
      userId: user.id
    });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: PublicUser,
    @Req() request: Request
  ) {
    if (!file) {
      throw new BadRequestException('Файл обязателен');
    }

    const { importedRecords, errors, errorDetails } = this.parseImportFile(file);
    const status = errors.length ? 'failed' : 'completed';

    const record = await this.importsService.create({
      fileName: file.originalname,
      userId: user.id,
      importedRecords,
      errors: errors.length,
      errorDetails,
      status
    });

    await this.auditService.create({
      userId: user.id,
      userName: user.name,
      action: 'import_performed',
      entity: 'import_record',
      newValue: {
        id: (record as any)._id?.toString(),
        fileName: record.fileName,
        importedRecords: record.importedRecords,
        status: record.status
      },
      ipAddress: request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown'
    });

    return record;
  }

  private parseImportFile(file: Express.Multer.File) {
    const errors: Record<string, unknown>[] = [];
    let importedRecords = 0;

    try {
      const buffer = file.buffer;
      if (!buffer) {
        throw new Error('Невозможно прочитать файл');
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        importedRecords = Math.max(0, rows.length - 1);
      } else if (ext === 'csv' || ext === 'txt') {
        const text = buffer.toString('utf8');
        importedRecords = Math.max(0, text.split(/\r?\n/).filter((line: string) => line.trim()).length - 1);
      } else {
        errors.push({ message: `Неподдерживаемый формат файла: ${ext}` });
      }
    } catch (error) {
      errors.push({ message: error instanceof Error ? error.message : 'Не удалось разобрать файл' });
    }

    return { importedRecords, errors, errorDetails: errors };
  }
}
