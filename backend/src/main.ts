import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const corsOrigin = configService
    .get<string>('API_CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({ origin: corsOrigin, credentials: true });

  app.setGlobalPrefix('api');

  // Global validation: reject unknown properties and enforce DTO rules.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VerdiCred API')
    .setDescription(
      'VerdiCred — trusted digital carbon credit verification platform.\n\n' +
        'Stage 1: Project Registration & Onboarding.\n' +
        'Stage 2: Evidence Ingestion Layer (Sentinel-2, Landsat, NASA EarthData, ' +
        'OpenWeather, Geo-upload adapters → Pinata IPFS, with RBAC + audit logging).\n\n' +
        'Authentication uses Supabase JWT. Send the Supabase access token in the ' +
        '`Authorization: Bearer <token>` header. After sign-up, call `POST /api/auth/profile` ' +
        'to provision your application profile and role.',
    )
    .setVersion('2.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'supabase-jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`VerdiCred API listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
