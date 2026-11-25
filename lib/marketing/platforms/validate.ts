import type { Platform } from './types';

export interface ValidationMedia {
  mimeType: string;
  fileSize: number;
}

export const CAPTION_LIMITS: Record<Platform, number> = {
  FACEBOOK: 63206,
  INSTAGRAM: 2200,
  LINKEDIN: 3000,
  YOUTUBE: 5000,
  TWITTER: 280,
  THREADS: 500,
};

const MAX_INSTAGRAM_HASHTAGS = 30;
const MAX_YOUTUBE_TITLE = 100;
const MAX_INSTAGRAM_IMAGE = 8 * 1024 * 1024;

export function isVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

/** Length in characters as a person counts them, so an emoji counts once. */
function length(text: string): number {
  return [...text].length;
}

/** Everything a platform would reject, found before the post is queued. */
export function validatePost(
  platform: Platform,
  post: { title: string; caption: string; media: ValidationMedia | null },
): string[] {
  const errors: string[] = [];
  const { title, caption, media } = post;
  const limit = CAPTION_LIMITS[platform];

  if (length(caption) > limit) {
    errors.push(`Caption is ${length(caption)} characters; the limit is ${limit}.`);
  }

  switch (platform) {
    case 'FACEBOOK':
      if (!caption.trim() && !media) errors.push('Needs a caption or media.');
      break;
    case 'INSTAGRAM':
      if (!media) errors.push('Needs an image or video.');
      if (media && !isVideo(media.mimeType) && media.mimeType !== 'image/jpeg') {
        errors.push('Images must be JPEG.');
      }
      if (media && !isVideo(media.mimeType) && media.fileSize > MAX_INSTAGRAM_IMAGE) {
        errors.push('Images must be 8 MB or smaller.');
      }
      if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > MAX_INSTAGRAM_HASHTAGS) {
        errors.push(`At most ${MAX_INSTAGRAM_HASHTAGS} hashtags.`);
      }
      break;
    case 'LINKEDIN':
      if (!caption.trim()) errors.push('Needs a caption.');
      if (media && isVideo(media.mimeType)) errors.push('Video is not supported yet; use text or an image.');
      break;
    case 'YOUTUBE':
      if (!media || !isVideo(media.mimeType)) errors.push('Needs a video.');
      if (!title.trim()) errors.push('Needs a title, which becomes the video title.');
      if (length(title) > MAX_YOUTUBE_TITLE) errors.push(`Title must be ${MAX_YOUTUBE_TITLE} characters or fewer.`);
      if (/[<>]/.test(title) || /[<>]/.test(caption)) errors.push('Title and description cannot contain < or >.');
      break;
    case 'TWITTER':
      if (!caption.trim()) errors.push('Needs a caption.');
      if (media) errors.push('Media is not supported on X yet; use text only.');
      break;
    case 'THREADS':
      if (!caption.trim() && !media) errors.push('Needs a caption or media.');
      break;
  }
  return errors;
}
