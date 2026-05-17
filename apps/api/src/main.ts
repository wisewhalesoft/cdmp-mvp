import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3000;
  // 容器內必須 bind 0.0.0.0 才能讓 docker network 其他 service（如 cdmp-web vite proxy）連線；
  // 預設 NestJS 只 bind localhost，主機 docker port mapping 仍可，但跨容器會 ECONNREFUSED。
  await app.listen(port, '0.0.0.0');
  console.log(`CDMP API running on port ${port}`);
}

bootstrap();
// nudge for nest --watch

