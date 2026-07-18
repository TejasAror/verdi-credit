import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { GeoValidationService } from './geo-validation.service';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [EvidenceModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, GeoValidationService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
