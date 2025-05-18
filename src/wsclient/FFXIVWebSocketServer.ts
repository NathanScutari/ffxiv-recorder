import { WebSocketServer, WebSocket } from 'ws';

type EventCallback = (event: any) => void;

export class FFXIVWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private listeners: Record<string, EventCallback[]> = {};

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      console.log('Overlay connected to FFXIV Recorder');
      this.clients.add(ws);

      ws.on('message', (data) => {
        let event;
        try {
          event = JSON.parse(data.toString());
        } catch {
          console.error('Invalid JSON:', data.toString());
          return;
        }

        if (!event?.type) {
          console.warn('Event without type:', event);
          return;
        }

        this.dispatchEvent(event.type, event);
      });

      ws.on('close', () => {
        console.log('Overlay disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });
  }

  public dispose() {
    this.wss.close();
  }

  addOverlayListener(eventType: string, callback: EventCallback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  removeOverlayListener(eventType: string, callback: EventCallback) {
    const list = this.listeners[eventType];
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
  }

  private dispatchEvent(eventType: string, event: any) {
    const callbacks = this.listeners[eventType];
    if (!callbacks) return;
    for (const cb of callbacks) {
      cb(event);
    }
  }

  broadcast(data: any) {
    const payload = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
