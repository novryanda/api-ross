import { Injectable } from '@nestjs/common';

export type HealthStatus = {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
};

@Injectable()
export class AppService {
  private readonly startedAt = Date.now();

  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'ross-api',
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
