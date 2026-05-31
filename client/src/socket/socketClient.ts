import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from 'shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClient {
  private socket: GameSocket | null = null;

  connect(): GameSocket {
    if (this.socket?.connected) return this.socket;

    this.socket = io('/', {
      transports: ['websocket'],
      autoConnect: true,
    }) as GameSocket;

    return this.socket;
  }

  get(): GameSocket | null {
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketClient = new SocketClient();
