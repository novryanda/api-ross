import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      success: true,
      data: 'Hello World!',
    });
  });

  it('/api/v1/auth/me (GET) rejects anonymous requests', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
