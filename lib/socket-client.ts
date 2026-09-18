import { io as ioClient, Socket } from 'socket.io-client';

export function getClientSocket(tenantId?: string): Socket {
  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  return ioClient(socketUrl, {
    path: '/socket.io',
    query: tenantId ? { tenantId } : undefined,
    reconnection: true,
    reconnectionDelay: 2000,
  });
}
