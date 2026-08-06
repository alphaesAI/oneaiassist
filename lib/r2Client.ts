import { S3Client } from '@aws-sdk/client-s3';

const R2_ENDPOINT = `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const r2Client = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto', // required but ignored by R2
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '',
  },
});
