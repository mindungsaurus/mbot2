import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      ok: true,
      service: 'mbot2',
      now: new Date().toISOString(),
    };
  }
}
