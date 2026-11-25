import { linkedin } from './linkedin';
import { facebook, instagram } from './meta';
import { threads } from './threads';
import type { Platform, PlatformAdapter } from './types';
import { twitter } from './twitter';
import { youtube } from './youtube';

export const adapters: Record<Platform, PlatformAdapter> = {
  FACEBOOK: facebook,
  INSTAGRAM: instagram,
  LINKEDIN: linkedin,
  YOUTUBE: youtube,
  TWITTER: twitter,
  THREADS: threads,
};

export * from './types';
