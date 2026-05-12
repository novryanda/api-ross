import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { getTrustedOrigins } from './config/env.js';

function setupSwagger(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const config = new DocumentBuilder()
    .setTitle('ROSS/BuzzTrack Backend API')
    .setDescription(
      [
        'Backend API for campaign, blast, comment, dashboard, audit, export, and authentication workflows.',
        'Business endpoints use Better Auth session cookies. Better Auth auth endpoints are mounted at /api/auth/*.',
        'Standard success envelope: { success: true, data, meta? }. Standard error envelope: { success: false, error: { code, message, details } }.',
      ].join('\n\n'),
    )
    .setVersion('1.4')
    .addCookieAuth(
      'ross.session_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'ross.session_token',
        description:
          'Better Auth session cookie. Cookie name may include the configured ross prefix.',
      },
      'sessionCookie',
    )
    .addTag('Auth')
    .addTag('Users')
    .addTag('Profile')
    .addTag('Campaigns')
    .addTag('Campaign Members')
    .addTag('Social Accounts')
    .addTag('Blast Targets')
    .addTag('Blast Attempts')
    .addTag('Blast Reports')
    .addTag('Comment Commands')
    .addTag('Comment Tasks')
    .addTag('Dashboard')
    .addTag('Audit Logs')
    .addTag('Exports')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  document.paths['/api/auth/sign-in/email'] = {
    post: {
      tags: ['Auth'],
      summary: 'Sign in with email and password',
      description: 'Better Auth endpoint. Returns session cookies on success.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', format: 'password' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Signed in.' },
        '400': { description: 'Invalid credentials or validation error.' },
        '403': { description: 'Inactive, suspended, or forbidden user.' },
      },
    },
  };
  document.paths['/api/auth/sign-out'] = {
    post: {
      tags: ['Auth'],
      summary: 'Sign out current session',
      description: 'Better Auth endpoint. Requires the active session cookie.',
      security: [{ sessionCookie: [] }],
      responses: {
        '200': { description: 'Signed out.' },
        '401': { description: 'No valid session.' },
      },
    },
  };

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.enableShutdownHooks();
  app.enableCors({
    origin: getTrustedOrigins(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
