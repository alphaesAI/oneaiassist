export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message);
    this.name = 'HttpError';
  }
}
