import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is missing.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum 50MB limit' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type '${file.type}'. Only images and videos are allowed.` },
        { status: 400 }
      );
    }

    // Ensure media directory exists
    const mediaDir = path.join(process.cwd(), 'public', 'media');
    fs.mkdirSync(mediaDir, { recursive: true });

    const fileExt = path.extname(file.name) || '.bin';
    const mediaId = crypto.randomUUID();
    const destFileName = `${mediaId}${fileExt}`;
    const destFilePath = path.join(mediaDir, destFileName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destFilePath, buffer);

    return NextResponse.json({
      success: true,
      mediaId,
      fileName: file.name,
      mimeType: file.type,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to upload media file';
    console.error('[API /api/media/upload Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
