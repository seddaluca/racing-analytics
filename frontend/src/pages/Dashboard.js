/**
 * Dashboard - Racing Analytics Frontend
 * Pagina principale con overview e statistiche
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  DirectionsCar as CarIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  RadioButtonChecked as LiveIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';

// Services
import { analyticsAPI, telemetryAPI, formatLapTime, formatSpeed, formatDateTime } from '../services/api';
import { useWebSocket } from '../services/websocket';

// Components
import TelemetryChart from '../components/TelemetryChart';
import SessionCard from '../components/SessionCard';
import LoadingSkeleton from '../components/LoadingSkeleton';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

const Dashboard = () => {
  const [currentSession, setCurrentSession] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [realTimeTelemetry, setRealTimeTelemetry] = useState(null);

  const queryClient = useQueryClient();
  const {
    isConnected,
    addEventListener,
    removeEventListener,
    getLatestTelemetry
  } = useWebSocket();

  // Funzione per determinare il colore delle gomme in base alla temperatura
  const getTireColor = (temperature) => {
    if (!temperature) return '#666';
    if (temperature < 60) return '#00bcd4';   // Fredde - Azzurro
    if (temperature < 80) return '#4caf50';   // Ideali - Verde
    if (temperature < 100) return '#ff9800';  // Calde - Arancione
    return '#f44336';                         // Troppo calde - Rosso
  };

  // Query per dati dashboard
  const {
    data: dashboardData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: analyticsAPI.getDashboardData,
    refetchInterval: 30000, // Refresh ogni 30 secondi
    staleTime: 10000,
  });

  // Effetto per WebSocket listeners
  useEffect(() => {
    const unsubscribeTelemetry = addEventListener('telemetry_data', (data) => {
      setRealTimeTelemetry(data);
    });

    const unsubscribeSession = addEventListener('session_update', (data) => {
      if (data.type === 'session_started') {
        setCurrentSession(data.session);
        setIsRecording(true);
      } else if (data.type === 'session_stopped') {
        setIsRecording(false);
        setCurrentSession(null);
        // Refresh dati dashboard
        queryClient.invalidateQueries(['dashboard']);
      }
    });

    return () => {
      unsubscribeTelemetry();
      unsubscribeSession();
    };
  }, [addEventListener, removeEventListener, queryClient]);

  // Gestori eventi
  const handleStartSession = async () => {
    try {
      const sessionData = {
        circuit_name: 'Suzuka Circuit', // TODO: Permettere selezione
        vehicle_name: 'GT-R NISMO',     // TODO: Permettere selezione
        game_mode: 'TIME_TRIAL'
      };

      const response = await telemetryAPI.startSession(sessionData);
      setCurrentSession(response);
      setIsRecording(true);
    } catch (error) {
      console.error('Errore avvio sessione:', error);
    }
  };

  const handleStopSession = async () => {
    if (currentSession) {
      try {
        await telemetryAPI.stopSession(currentSession.session_id);
        setIsRecording(false);
        setCurrentSession(null);
        queryClient.invalidateQueries(['dashboard']);
      } catch (error) {
        console.error('Errore stop sessione:', error);
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <LoadingSkeleton />
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Card>
          <CardContent>
            <Typography color="error">
              Errore caricamento dati: {error.message}
            </Typography>
            <Button onClick={() => refetch()} startIcon={<RefreshIcon />}>
              Riprova
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const stats = dashboardData?.stats || {};
  const recentSessions = dashboardData?.recentSessions || [];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>

        <Box display="flex" gap={2} alignItems="center">
          {/* Stato connessione */}
          <Chip
            icon={<LiveIcon />}
            label={isConnected ? 'Connesso' : 'Disconnesso'}
            color={isConnected ? 'success' : 'error'}
            variant="outlined"
          />

          {/* Controlli sessione */}
          {!isRecording ? (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={handleStartSession}
              disabled={!isConnected}
            >
              Avvia Sessione
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStopSession}
            >
              Ferma Sessione
            </Button>
          )}

          <Tooltip title="Aggiorna dati">
            <IconButton onClick={() => refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Statistiche generali */}
        <Grid item xs={12} md={3}>
          <Card className="card-hover">
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Sessioni Totali
                  </Typography>
                  <Typography variant="h4">
                    {stats.total_sessions || 0}
                  </Typography>
                </Box>
                <TimerIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card className="card-hover">
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Circuiti
                  </Typography>
                  <Typography variant="h4">
                    {stats.total_circuits || 0}
                  </Typography>
                </Box>
                <TrendingUpIcon color="secondary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card className="card-hover">
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Veicoli
                  </Typography>
                  <Typography variant="h4">
                    {stats.total_vehicles || 0}
                  </Typography>
                </Box>
                <CarIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card className="card-hover">
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Punti Telemetria
                  </Typography>
                  <Typography variant="h4">
                    {stats.telemetry?.total_points ?
                      (stats.telemetry.total_points / 1000000).toFixed(1) + 'M' :
                      '0'}
                  </Typography>
                </Box>
                <SpeedIcon color="secondary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Sessione corrente / Telemetria live */}
        {isRecording && currentSession ? (
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6">
                    Sessione Live
                  </Typography>

                  {/* Indicatore stato */}
                  {realTimeTelemetry?.status && (
                    <Chip
                      icon={realTimeTelemetry.status === 'paused' ? <StopIcon /> : <PlayIcon />}
                      label={realTimeTelemetry.status === 'paused' ? 'In Pausa' : 'Attivo'}
                      color={realTimeTelemetry.status === 'paused' ? 'warning' : 'success'}
                      variant="outlined"
                    />
                  )}
                </Box>

                {/* Informazioni Veicolo */}
                {realTimeTelemetry?.vehicle && (
                  <Box
                    sx={{
                      mb: 3,
                      p: 2,
                      backgroundColor: 'action.hover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider'
                    }}
                  >
                    <Typography variant="h6" gutterBottom>
                      <CarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Veicolo Corrente
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <Typography variant="body2" color="textSecondary">
                          ID Veicolo (GT7)
                        </Typography>
                        <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                          {realTimeTelemetry.vehicle.car_id || 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="body2" color="textSecondary">
                          Nome
                        </Typography>
                        <Typography variant="h6">
                          {realTimeTelemetry.vehicle.name || 'Sconosciuto'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="body2" color="textSecondary">
                          Produttore
                        </Typography>
                        <Typography variant="h6">
                          {realTimeTelemetry.vehicle.manufacturer || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                )}

                {realTimeTelemetry ? (
                  <>
                    <Grid container spacing={2}>
                      <Grid item xs={6} md={3}>
                        <Box textAlign="center">
                          <Typography
                            variant="h4"
                            className="speed-indicator"
                            sx={{
                              opacity: realTimeTelemetry.status === 'paused' ? 0.5 : 1,
                              color: realTimeTelemetry.status === 'paused' ? '#666' : '#ff6b00'
                            }}
                          >
                            {Math.round(realTimeTelemetry.speed || 0)}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            km/h
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={6} md={3}>
                        <Box textAlign="center">
                          <Typography
                            variant="h4"
                            className="rpm-indicator"
                            sx={{
                              opacity: realTimeTelemetry.status === 'paused' ? 0.5 : 1,
                              color: realTimeTelemetry.status === 'paused' ? '#666' : '#00bcd4'
                            }}
                          >
                            {Math.round(realTimeTelemetry.rpm || 0)}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            RPM
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={6} md={3}>
                        <Box textAlign="center">
                          <Typography
                            variant="h4"
                            className="gear-indicator"
                            sx={{
                              opacity: realTimeTelemetry.status === 'paused' ? 0.5 : 1,
                              color: realTimeTelemetry.status === 'paused' ? '#666' : '#ffffff'
                            }}
                          >
                            {realTimeTelemetry.gear || 'N'}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Marcia
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={6} md={3}>
                        <Box textAlign="center">
                          <Typography
                            variant="h4"
                            sx={{
                              opacity: realTimeTelemetry.status === 'paused' ? 0.5 : 1,
                              color: realTimeTelemetry.status === 'paused' ? '#666' : '#ffffff'
                            }}
                          >
                            {Math.round((realTimeTelemetry.throttle || 0) * 100)}%
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Acceleratore
                          </Typography>
                        </Box>
                      </Grid>

                      {/* Indicatori di stato aggiuntivi */}
                      <Grid item xs={12}>
                        <Box display="flex" gap={1} justifyContent="center" mt={2}>
                          <Chip
                            label={realTimeTelemetry.flags?.on_track ? 'In Pista' : 'Fuori Pista'}
                            color={realTimeTelemetry.flags?.on_track ? 'success' : 'error'}
                            variant="outlined"
                            size="small"
                          />

                          {realTimeTelemetry.status === 'paused' && (
                            <Chip
                              label="Gioco in Pausa"
                              color="warning"
                              variant="outlined"
                              size="small"
                            />
                          )}
                        </Box>
                      </Grid>
                    </Grid>

                    {/* Parametri Tecnici Veicolo */}
                    {realTimeTelemetry?.vehicle && (
                      <Box sx={{ mt: 3 }}>
                        <Typography variant="h6" gutterBottom>
                          📊 Parametri Veicolo
                        </Typography>

                        <Grid container spacing={2}>
                          {/* Pressione Olio */}
                          <Grid item xs={6} md={3}>
                            <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                              <Typography variant="body2" color="textSecondary">
                                Pressione Olio
                              </Typography>
                              <Typography
                                variant="h6"
                                sx={{
                                  color: (realTimeTelemetry.vehicle.oil_pressure || 0) < 2 ? '#f44336' : '#4caf50',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {(realTimeTelemetry.vehicle.oil_pressure || 0).toFixed(1)} bar
                              </Typography>
                            </Card>
                          </Grid>

                          {/* Temperatura Olio */}
                          <Grid item xs={6} md={3}>
                            <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                              <Typography variant="body2" color="textSecondary">
                                Temp. Olio
                              </Typography>
                              <Typography
                                variant="h6"
                                sx={{
                                  color: (realTimeTelemetry.vehicle.oil_temperature || 0) > 120 ? '#f44336' : '#4caf50',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {Math.round(realTimeTelemetry.vehicle.oil_temperature || 0)}°C
                              </Typography>
                            </Card>
                          </Grid>

                          {/* Temperatura Acqua */}
                          <Grid item xs={6} md={3}>
                            <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                              <Typography variant="body2" color="textSecondary">
                                Temp. Acqua
                              </Typography>
                              <Typography
                                variant="h6"
                                sx={{
                                  color: (realTimeTelemetry.vehicle.water_temperature || 0) > 100 ? '#f44336' : '#4caf50',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {Math.round(realTimeTelemetry.vehicle.water_temperature || 0)}°C
                              </Typography>
                            </Card>
                          </Grid>

                          {/* Carburante */}
                          <Grid item xs={6} md={3}>
                            <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                              <Typography variant="body2" color="textSecondary">
                                Carburante
                              </Typography>
                              <Typography
                                variant="h6"
                                sx={{
                                  color: (realTimeTelemetry.vehicle.fuel_percentage || 0) < 10 ? '#f44336' :
                                         (realTimeTelemetry.vehicle.fuel_percentage || 0) < 25 ? '#ff9800' : '#4caf50',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {Math.round(realTimeTelemetry.vehicle.fuel_percentage || 0)}%
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                {(realTimeTelemetry.vehicle.fuel_level || 0).toFixed(1)}L / {(realTimeTelemetry.vehicle.fuel_capacity || 0).toFixed(1)}L
                              </Typography>
                            </Card>
                          </Grid>

                          {/* Turbo Boost */}
                          {(realTimeTelemetry.vehicle.turbo_boost || 0) > 0 && (
                            <Grid item xs={6} md={3}>
                              <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                                <Typography variant="body2" color="textSecondary">
                                  Turbo Boost
                                </Typography>
                                <Typography
                                  variant="h6"
                                  sx={{
                                    color: '#00bcd4',
                                    fontFamily: 'monospace'
                                  }}
                                >
                                  {(realTimeTelemetry.vehicle.turbo_boost || 0).toFixed(2)} bar
                                </Typography>
                              </Card>
                            </Grid>
                          )}
                        </Grid>

                        {/* Temperature Gomme */}
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            🏎️ Temperature Gomme
                          </Typography>
                          <Grid container spacing={1}>
                            <Grid item xs={6}>
                              <Box display="flex" justifyContent="space-between">
                                <Card variant="outlined" sx={{ p: 1, flex: 1, mr: 0.5, textAlign: 'center' }}>
                                  <Typography variant="caption" color="textSecondary">AS</Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: getTireColor(realTimeTelemetry.vehicle.tire_temperatures?.front_left),
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {Math.round(realTimeTelemetry.vehicle.tire_temperatures?.front_left || 0)}°
                                  </Typography>
                                </Card>
                                <Card variant="outlined" sx={{ p: 1, flex: 1, ml: 0.5, textAlign: 'center' }}>
                                  <Typography variant="caption" color="textSecondary">AD</Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: getTireColor(realTimeTelemetry.vehicle.tire_temperatures?.front_right),
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {Math.round(realTimeTelemetry.vehicle.tire_temperatures?.front_right || 0)}°
                                  </Typography>
                                </Card>
                              </Box>
                            </Grid>
                            <Grid item xs={6}>
                              <Box display="flex" justifyContent="space-between">
                                <Card variant="outlined" sx={{ p: 1, flex: 1, mr: 0.5, textAlign: 'center' }}>
                                  <Typography variant="caption" color="textSecondary">PS</Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: getTireColor(realTimeTelemetry.vehicle.tire_temperatures?.rear_left),
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {Math.round(realTimeTelemetry.vehicle.tire_temperatures?.rear_left || 0)}°
                                  </Typography>
                                </Card>
                                <Card variant="outlined" sx={{ p: 1, flex: 1, ml: 0.5, textAlign: 'center' }}>
                                  <Typography variant="caption" color="textSecondary">PD</Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: getTireColor(realTimeTelemetry.vehicle.tire_temperatures?.rear_right),
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {Math.round(realTimeTelemetry.vehicle.tire_temperatures?.rear_right || 0)}°
                                  </Typography>
                                </Card>
                              </Box>
                            </Grid>
                          </Grid>
                        </Box>
                      </Box>
                    )}
                  </>
                ) : (
                  <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                    <Typography variant="body1" ml={2}>
                      Attendendo dati telemetria...
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ) : (
          <Grid item xs={12} lg={8}>
            <TelemetryChart />
          </Grid>
        )}

        {/* Veicoli top performance */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Veicoli
              </Typography>

              {stats.top_vehicles?.length > 0 ? (
                <Box>
                  {stats.top_vehicles.slice(0, 5).map((vehicle, index) => (
                    <Box
                      key={vehicle.name}
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      py={1}
                      borderBottom={index < 4 ? '1px solid #2a2a2a' : 'none'}
                    >
                      <Box>
                        <Typography variant="body1">
                          {vehicle.name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {vehicle.sessions_count} sessioni
                        </Typography>
                      </Box>
                      <Typography variant="body2" className="lap-time">
                        {vehicle.best_time ? formatLapTime(vehicle.best_time) : '--:--'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="textSecondary">
                  Nessun dato disponibile
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Sessioni recenti */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Sessioni Recenti
              </Typography>

              {recentSessions.length > 0 ? (
                <Grid container spacing={2}>
                  {recentSessions.map((session) => (
                    <Grid item xs={12} md={6} lg={4} key={session.id}>
                      <SessionCard session={session} />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography color="textSecondary">
                  Nessuna sessione trovata
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;