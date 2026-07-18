import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString, Min } from 'class-validator';
import { ProjectType } from '@prisma/client';
import { IsGeoPolygon } from '../geo-polygon.validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Amazon Reforestation Phase 1' })
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @ApiProperty({
    enum: ProjectType,
    example: ProjectType.REFORESTATION,
    description: 'REFORESTATION | SOIL_CARBON | RENEWABLE_ENERGY',
  })
  @IsEnum(ProjectType)
  projectType: ProjectType;

  @ApiProperty({
    example: 'VM0033 - Afforestation, Reforestation and Revegetation',
    description: 'Mandatory: the approved carbon methodology.',
  })
  @IsString()
  @IsNotEmpty()
  methodology: string;

  @ApiProperty({
    example: 1250.5,
    description: 'Mandatory: expected annual CO2 sequestration in tonnes.',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Min(0.0001)
  expectedAnnualTonnes: number;

  @ApiProperty({
    type: 'object',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [-60.0, -3.0],
          [-59.9, -3.0],
          [-59.9, -2.9],
          [-60.0, -2.9],
          [-60.0, -3.0],
        ],
      ],
    },
    description: 'Mandatory: GeoJSON Polygon defining the project boundary.',
  })
  @IsGeoPolygon()
  geoPolygon: Record<string, any>;
}
