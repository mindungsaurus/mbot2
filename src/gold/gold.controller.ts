import { Controller } from '@nestjs/common';
import { GoldService } from './gold.service';

@Controller('gold')
export class GoldController {
  constructor(private goldService: GoldService) {}
}
