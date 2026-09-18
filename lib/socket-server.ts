import { Server as SocketIOServer } from 'socket.io';

declare global {
  // eslint-disable-next-line no-var
  var __oneai_io: SocketIOServer | undefined;
}

export function setSocketIO(io: SocketIOServer) {
  globalThis.__oneai_io = io;
}

export function getSocketIO(): SocketIOServer | undefined {
  return globalThis.__oneai_io;
}
