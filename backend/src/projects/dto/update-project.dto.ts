import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { ProjectStatus, ProjectType } from '@prisma/client';
import { IsGeoPolygon } from '../geo-polygon.validator';

export class UpdateProjectDto {
  @ApiProperty({ required: false, example: 'Amazon Reforestation Phase 1 (revised)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectName?: string;

  @ApiProperty({ required: false, enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @ApiProperty({ required: false, example: 'VM0033 - revised methodology' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  methodology?: string;

  @ApiProperty({ required: false, example: 1300.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Min(0.0001)
  expectedAnnualTonnes?: number;

  @ApiProperty({ required: false, type: 'object' })
  @IsOptional()
  @IsGeoPolygon()
  geoPolygon?: Record<string, any>;

  @ApiProperty({ required: false, enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
