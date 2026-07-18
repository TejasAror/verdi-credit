import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { EvidenceService } from './evidence.service';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { EvidenceResponseDto } from './dto/evidence-response.dto';
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_MIME_TYPE_REGEX,
  MAX_FILE_SIZE_BYTES,
} from './dto/evidence.constants';

@ApiTags('Evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('upload')
  @Roles(Role.DEVELOPER, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Upload evidence for a project (Developer/Admin)',
    description:
      'Multipart form fields: `projectId` (string), `source` ' +
      '(EvidenceSource enum), optional `latitude`/`longitude` (numbers, ' +
      'validated -90..90 / -180..180), `timestamp` (ISO-8601), `note` ' +
      '(string). For GEO_UPLOAD a `file` is required: image/png, ' +
      'image/jpeg, application/pdf, or application/json, <=10MB. The file ' +
      'bytes are pinned to IPFS (Pinata) and only the returned CID is ' +
      'stored in the database.',
  })
  @ApiBody({
    description:
      'multipart/form-data. `file` is optional for remote sources and ' +
      'required for GEO_UPLOAD.',
    type: UploadEvidenceDto,
    examples: {
      geoUpload: {
        summary: 'GEO_UPLOAD with a PNG file',
        value: {
          projectId: 'a1b2c3d4-1234-5678-90ab-cdef01234567',
          source: 'GEO_UPLOAD',
          latitude: -3.4653,
          longitude: -62.2159,
          timestamp: '2026-07-15T12:00:00.000Z',
          note: 'Field photo of plot A saplings',
          file: '<binary image/png, <=10MB>',
        },
      },
      sentinel2: {
        summary: 'SENTINEL2 (no file needed)',
        value: {
          projectId: 'a1b2c3d4-1234-5678-90ab-cdef01234567',
          source: 'SENTINEL2',
          latitude: -3.4653,
          longitude: -62.2159,
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: EvidenceResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input: missing project, bad lat/lng range, unsupported ' +
      'file type, file too large, or GEO_UPLOAD without a file.',
  })
  @ApiResponse({ status: 401, description: 'Missing/invalid token or role.' })
  @ApiResponse({ status: 403, description: 'Not allowed to upload to this project.' })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  upload(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_MIME_TYPE_REGEX }),
        ],
      }),
    )
    file: Express.Multer.File | undefined,
    @Body() body: UploadEvidenceDto,
    @CurrentUser() actor: { id: string; role: Role; supabaseId: string },
  ) {
    const filePayload = file
      ? {
          buffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
        }
      : undefined;

    return this.evidenceService.upload({
      dto: body,
      projectId: body.projectId,
      actorId: actor.id,
      actorRole: actor.role,
      supabaseId: actor.supabaseId,
      file: filePayload,
    });
  }

  @Get(':id')
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Get a single evidence record by id (any authenticated user)' })
  @ApiParam({ name: 'id', description: 'Evidence id (uuid)' })
  @ApiResponse({ status: 200, type: EvidenceResponseDto })
  @ApiResponse({ status: 404, description: 'Evidence not found.' })
  getById(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; role: Role },
  ) {
    return this.evidenceService.getById(id, actor.id, actor.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({ summary: 'Delete evidence (Admin only)' })
  @ApiParam({ name: 'id', description: 'Evidence id (uuid)' })
  @ApiResponse({ status: 200, description: '{ id, deleted: true }' })
  @ApiResponse({ status: 401, description: 'Admin role required.' })
  @ApiResponse({ status: 404, description: 'Evidence not found.' })
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string },
  ) {
    return this.evidenceService.remove(id, actor.id);
  }
}
