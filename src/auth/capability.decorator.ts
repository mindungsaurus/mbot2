import { SetMetadata } from '@nestjs/common';
import type { UserCapabilityType } from '@prisma/client';

export const REQUIRED_CAPABILITIES_KEY = 'requiredCapabilities';

export function RequireCapability(...capabilities: UserCapabilityType[]) {
  return SetMetadata(REQUIRED_CAPABILITIES_KEY, capabilities);
}
