export function getEngineBaseUrl(): string {
  if (process.env.WHATSAPP_ENGINE_URL) {
    return process.env.WHATSAPP_ENGINE_URL;
  }
  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}`;
}
