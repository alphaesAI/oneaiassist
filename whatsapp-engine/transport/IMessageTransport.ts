export interface SendResult {
  messageId: string;
}

export interface IMessageTransport {
  sendText(to: string, text: string): Promise<SendResult>;
  sendImage(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult>;
  sendVideo(to: string, opts: { filePath: string; caption?: string }): Promise<SendResult>;
  sendAudio(to: string, opts: { filePath: string; ptt?: boolean }): Promise<SendResult>;
  setTyping(to: string, on: boolean): Promise<void>;
  getStatus(): Promise<string>;
  disconnect(): Promise<void>;
}
