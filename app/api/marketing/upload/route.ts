import { NextResponse } from 'next/server';

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
        { error: `Invalid file type '${file.type}'. Only images and videos (PNG, JPG, MP4, MOV) are allowed.` },
        { status: 400 }
      );
    }

    // Mock Cloudflare R2 Public CDN Storage URL
    const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const mockR2Url = `https://r2.oneaiassist.com/marketing/${Date.now()}_${filename}`;

    return NextResponse.json({
      success: true,
      url: mockR2Url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to upload media file';
    console.error('[API /api/marketing/upload Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
