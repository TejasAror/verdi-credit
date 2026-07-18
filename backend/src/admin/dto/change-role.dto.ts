import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

export class ChangeRoleDto {
  @ApiProperty({
    enum: Role,
    example: Role.DEVELOPER,
    description: 'Target role to assign (DEVELOPER | BUYER | AUDITOR | ADMIN).',
  })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({
    required: false,
    example: 'Promoted after completing developer onboarding.',
    description: 'Optional reason recorded in the audit log.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
