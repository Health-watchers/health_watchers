import React from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from './api-config';

class SocketManager {
  private socket: Socket | null = null;
  private token: string | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected && this.token === token) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.token = token;
    this.socket = io(API_CONFIG.SOCKET_URL, {
      ...API_CONFIG.SOCKET_OPTIONS,
      auth: {
        token,
      },
    });

    this.setupEventHandlers();
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.token = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket.IO connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });

    // Appointment events
    this.socket.on('appointment:confirmed', (data) => {
      console.log('Appointment confirmed:', data);
      // Dispatch custom event for components to listen
      window.dispatchEvent(new CustomEvent('appointment:confirmed', { detail: data }));
    });

    this.socket.on('appointment:cancelled', (data) => {
      console.log('Appointment cancelled:', data);
      window.dispatchEvent(new CustomEvent('appointment:cancelled', { detail: data }));
    });

    this.socket.on('appointment:rescheduled', (data) => {
      console.log('Appointment rescheduled:', data);
      window.dispatchEvent(new CustomEvent('appointment:rescheduled', { detail: data }));
    });

    this.socket.on('appointment:patient_arrived', (data) => {
      console.log('Patient arrived:', data);
      window.dispatchEvent(new CustomEvent('appointment:patient_arrived', { detail: data }));
    });
  }

  // Join appointment room for real-time updates
  joinAppointment(appointmentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join_appointment', appointmentId);
    }
  }

  // Leave appointment room
  leaveAppointment(appointmentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave_appointment', appointmentId);
    }
  }
}

export const socketManager = new SocketManager();

// React hook for using Socket.IO
export function useSocket(token?: string) {
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (token) {
      const socketInstance = socketManager.connect(token);
      setSocket(socketInstance);

      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);

      socketInstance.on('connect', handleConnect);
      socketInstance.on('disconnect', handleDisconnect);

      return () => {
        socketInstance.off('connect', handleConnect);
        socketInstance.off('disconnect', handleDisconnect);
      };
    } else {
      socketManager.disconnect();
      setSocket(null);
      setConnected(false);
    }
  }, [token]);

  return { socket, connected };
}

// React hook for appointment events
export function useAppointmentEvents() {
  const [events, setEvents] = React.useState<any[]>([]);

  React.useEffect(() => {
    const handleAppointmentEvent = (event: CustomEvent) => {
      setEvents(prev => [...prev, { type: event.type, data: event.detail, timestamp: Date.now() }]);
    };

    const eventTypes = [
      'appointment:confirmed',
      'appointment:cancelled', 
      'appointment:rescheduled',
      'appointment:patient_arrived'
    ];

    eventTypes.forEach(eventType => {
      window.addEventListener(eventType, handleAppointmentEvent as EventListener);
    });

    return () => {
      eventTypes.forEach(eventType => {
        window.removeEventListener(eventType, handleAppointmentEvent as EventListener);
      });
    };
  }, []);

  return events;
}