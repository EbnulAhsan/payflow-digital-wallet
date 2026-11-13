import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { createValidationPipe } from './common/validation.pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  // The frontend runs on another origin and reads the refresh cookie, so CORS
  // must name that origin and allow credentials.
  app.enableCors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PayFlow API')
    .setDescription('PayFlow authentication API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.openapi = '3.1.0';
  SwaggerModule.setup('api/docs', app, document, { useGlobalPrefix: false });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
