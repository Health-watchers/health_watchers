import { io, Socket } from 'socket.io-client';

import { API_URL } from '@/lib/api';

const SOCKET_URL = API_URL;

let socket: Socket | null = null;

export function getSocket(accessToken: string): Socket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    autoConnect: true,
    reconnectionAttempts: 5,
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
