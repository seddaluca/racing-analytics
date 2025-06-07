/**
 * WebSocket Service - Racing Analytics Frontend
 * Gestisce la connessione Socket.IO per telemetria real-time
 */

import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = new Map();
    this.telemetryBuffer = [];
    this.maxBufferSize = 1000;
  }

  /**
   * Connetti al Socket.IO server
   */
  connect() {
    const wsUrl = process.env.REACT_APP_WS_URL || 'http://localhost:8001';

    console.log('Connessione Socket.IO...', wsUrl);

    this.socket = io(wsUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  /**
   * Disconnetti dal Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
    console.log('Socket.IO disconnesso');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.socket) return;

    // Connessione stabilita
    this.socket.on('connect', () => {
      console.log('Socket.IO connesso', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Notifica connessione
      this.emit('connection', { status: 'connected' });

      toast.success('Connessione telemetria stabilita');
    });

    // Disconnessione
    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnesso:', reason);
      this.isConnected = false;

      // Notifica disconnessione
      this.emit('connection', { status: 'disconnected', reason });

      if (reason !== 'io client disconnect') {
        toast.error('Connessione telemetria persa');
      }
    });

    // Errore di connessione
    this.socket.on('connect_error', (error) => {
      console.error('Errore connessione Socket.IO:', error);
      this.isConnected = false;
      this.reconnectAttempts++;

      this.emit('connection', {
        status: 'error',
        error: error.message,
        attempts: this.reconnectAttempts
      });

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        toast.error('Impossibile connettersi alla telemetria');
      }
    });

    // Riconnessione riuscita
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Riconnesso dopo ${attemptNumber} tentativo/i`);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.emit('connection', {
        status: 'reconnected',
        attempts: attemptNumber
      });

      toast.success('Connessione telemetria ripristinata');
    });

    // Dati telemetria in tempo reale
    this.socket.on('telemetry_data', (data) => {
      this.handleTelemetryData(data);
    });

    // Aggiornamenti sessione
    this.socket.on('session_update', (data) => {
      this.emit('session_update', data);
    });

    // Notifiche lap completati
    this.socket.on('lap_completed', (data) => {
      this.emit('lap_completed', data);
      toast.success(`Lap completato: ${this.formatLapTime(data.lapTime)}`);
    });

    // Best lap notification
    this.socket.on('best_lap', (data) => {
      this.emit('best_lap', data);
      toast.success(`🏆 Nuovo best lap: ${this.formatLapTime(data.lapTime)}`);
    });
  }

  /**
   * Gestisce dati telemetria
   */
  handleTelemetryData(data) {
    // Aggiungi al buffer
    this.telemetryBuffer.push({
      ...data,
      timestamp: Date.now()
    });

    // Mantieni buffer limitato
    if (this.telemetryBuffer.length > this.maxBufferSize) {
      this.telemetryBuffer = this.telemetryBuffer.slice(-this.maxBufferSize);
    }

    // Emetti dati agli ascoltatori
    this.emit('telemetry_data', data);
    this.emit('telemetry_buffer', this.telemetryBuffer);
  }

  /**
   * Aggiungi listener per evento
   */
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    // Restituisce funzione per rimuovere listener
    return () => {
      this.removeEventListener(event, callback);
    };
  }

  /**
   * Rimuovi listener per evento
   */
  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emetti evento ai listener
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Errore in listener ${event}:`, error);
        }
      });
    }
  }

  /**
   * Invia messaggio al server
   */
  send(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket.IO non connesso, impossibile inviare:', event);
    }
  }

  /**
   * Ottieni stato connessione
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id
    };
  }

  /**
   * Ottieni buffer telemetria
   */
  getTelemetryBuffer() {
    return this.telemetryBuffer;
  }

  /**
   * Pulisci buffer telemetria
   */
  clearTelemetryBuffer() {
    this.telemetryBuffer = [];
  }

  /**
   * Ottieni ultima lettura telemetria
   */
  getLatestTelemetry() {
    return this.telemetryBuffer.length > 0
      ? this.telemetryBuffer[this.telemetryBuffer.length - 1]
      : null;
  }

  /**
   * Formatta tempo lap
   */
  formatLapTime(timeMs) {
    if (!timeMs) return '--:--.---';

    const minutes = Math.floor(timeMs / 60000);
    const seconds = Math.floor((timeMs % 60000) / 1000);
    const milliseconds = timeMs % 1000;

    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Sottoscrivi a canale specifico
   */
  subscribe(channel) {
    this.send('subscribe', { channel });
  }

  /**
   * Annulla sottoscrizione a canale
   */
  unsubscribe(channel) {
    this.send('unsubscribe', { channel });
  }
}

// Crea istanza singleton
const wsService = new WebSocketService();

// Funzioni di utilità per uso nei componenti
export const connectWebSocket = () => {
  wsService.connect();
};

export const disconnectWebSocket = () => {
  wsService.disconnect();
};

export const useWebSocket = () => {
  return {
    service: wsService,
    isConnected: wsService.isConnected,
    addEventListener: wsService.addEventListener.bind(wsService),
    removeEventListener: wsService.removeEventListener.bind(wsService),
    getConnectionStatus: wsService.getConnectionStatus.bind(wsService),
    getTelemetryBuffer: wsService.getTelemetryBuffer.bind(wsService),
    getLatestTelemetry: wsService.getLatestTelemetry.bind(wsService),
    send: wsService.send.bind(wsService),
    subscribe: wsService.subscribe.bind(wsService),
    unsubscribe: wsService.unsubscribe.bind(wsService),
  };
};

export default wsService;