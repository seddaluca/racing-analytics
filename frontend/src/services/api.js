/**
 * API Service - Racing Analytics Frontend
 * Gestisce tutte le chiamate API al backend
 */

import axios from 'axios';
import toast from 'react-hot-toast';

// Configurazione base API
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8002';

// Crea istanza axios
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Aggiungi token di autenticazione se presente
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Gestione errori globale
    const message = error.response?.data?.detail || error.message || 'Errore di connessione';

    if (error.response?.status === 401) {
      // Token scaduto o non valido
      localStorage.removeItem('auth_token');
      toast.error('Sessione scaduta. Effettua nuovamente il login.');
    } else if (error.response?.status >= 500) {
      toast.error('Errore del server. Riprova più tardi.');
    } else if (error.response?.status >= 400) {
      toast.error(message);
    } else {
      toast.error('Errore di connessione. Controlla la connessione di rete.');
    }

    return Promise.reject(error);
  }
);

// === CIRCUITS API ===
export const circuitsAPI = {
  // Ottieni tutti i circuiti
  getAll: () => api.get('/circuits').then(res => res.data),

  // Ottieni circuito per ID
  getById: (id) => api.get(`/circuits/${id}`).then(res => res.data),

  // Ottieni leaderboard circuito
  getLeaderboard: (id) => api.get(`/analytics/circuit/${id}/leaderboard`).then(res => res.data),
};

// === VEHICLES API ===
export const vehiclesAPI = {
  // Ottieni tutti i veicoli
  getAll: () => api.get('/vehicles').then(res => res.data),

  // Ottieni veicolo per ID
  getById: (id) => api.get(`/vehicles/${id}`).then(res => res.data),

  // Ottieni performance veicolo
  getPerformance: (id) => api.get(`/analytics/vehicle/${id}/performance`).then(res => res.data),
};

// === SESSIONS API ===
export const sessionsAPI = {
  // Ottieni lista sessioni
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/sessions?${queryParams}`).then(res => res.data);
  },

  // Ottieni sessione per ID
  getById: (id) => api.get(`/sessions/${id}`).then(res => res.data),

  // Elimina sessione
  delete: (id) => api.delete(`/sessions/${id}`).then(res => res.data),

  // Ottieni telemetria sessione
  getTelemetry: (id, params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/sessions/${id}/telemetry?${queryParams}`).then(res => res.data);
  },

  // Ottieni lap sessione
  getLaps: (id) => api.get(`/sessions/${id}/laps`).then(res => res.data),
};

// === TELEMETRY API ===
export const telemetryAPI = {
  // Avvia nuova sessione
  startSession: (data) => {
    return axios.post(`${process.env.REACT_APP_TELEMETRY_URL || 'http://localhost:8001'}/sessions/start`, data)
      .then(res => res.data);
  },

  // Ferma sessione
  stopSession: (sessionId) => {
    return axios.post(`${process.env.REACT_APP_TELEMETRY_URL || 'http://localhost:8001'}/sessions/${sessionId}/stop`)
      .then(res => res.data);
  },

  // Ottieni stato connessione
  getConnectionStatus: () => {
    return axios.get(`${process.env.REACT_APP_TELEMETRY_URL || 'http://localhost:8001'}/health`)
      .then(res => res.data);
  },
};

// === ANALYTICS API ===
export const analyticsAPI = {
  // Confronta sessioni
  compareSession: (sessionIds) => {
    return api.post('/analytics/compare', sessionIds).then(res => res.data);
  },

  // Ottieni statistiche generali
  getOverviewStats: () => api.get('/analytics/stats/overview').then(res => res.data),

  // Ottieni dati per dashboard
  getDashboardData: () => {
    return Promise.all([
      analyticsAPI.getOverviewStats(),
      sessionsAPI.getAll({ limit: 5 }),
      // Aggiungi altre chiamate necessarie per dashboard
    ]).then(([stats, recentSessions]) => ({
      stats,
      recentSessions,
    }));
  },
};

// === UTILITY FUNCTIONS ===

/**
 * Formatta tempo lap in formato MM:SS.mmm
 */
export const formatLapTime = (timeMs) => {
  if (!timeMs) return '--:--.---';

  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = timeMs % 1000;

  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

/**
 * Formatta velocità
 */
export const formatSpeed = (speedKmh) => {
  if (speedKmh == null) return '--';
  return `${Math.round(speedKmh)} km/h`;
};

/**
 * Formatta RPM
 */
export const formatRPM = (rpm) => {
  if (rpm == null) return '--';
  return `${Math.round(rpm).toLocaleString()} RPM`;
};

/**
 * Formatta durata sessione
 */
export const formatDuration = (seconds) => {
  if (!seconds) return '--:--';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Formatta data/ora
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return '--';

  const date = new Date(dateString);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

/**
 * Calcola percentuale
 */
export const calculatePercentage = (value, total) => {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100);
};

/**
 * Ottieni colore per velocità
 */
export const getSpeedColor = (speed, maxSpeed = 300) => {
  const percentage = (speed / maxSpeed) * 100;

  if (percentage < 30) return '#4caf50'; // Verde
  if (percentage < 60) return '#ff9800'; // Arancione
  if (percentage < 80) return '#ff6b00'; // Arancione acceso
  return '#f44336'; // Rosso
};

/**
 * Ottieni colore per RPM
 */
export const getRPMColor = (rpm, maxRPM = 8000) => {
  const percentage = (rpm / maxRPM) * 100;

  if (percentage < 60) return '#00bcd4'; // Azzurro
  if (percentage < 80) return '#ff9800'; // Arancione
  return '#f44336'; // Rosso
};

/**
 * Debounce function per ottimizzare chiamate API
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export default api;