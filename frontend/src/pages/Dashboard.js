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
                <Typography variant="h6" gutterBottom>
                  Sessione Live
                </Typography>

                {realTimeTelemetry ? (
                  <Grid container spacing={2}>
                    <Grid item xs={6} md={3}>
                      <Box textAlign="center">
                        <Typography variant="h4" className="speed-indicator">
                          {Math.round(realTimeTelemetry.speed || 0)}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          km/h
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={6} md={3}>
                      <Box textAlign="center">
                        <Typography variant="h4" className="rpm-indicator">
                          {Math.round(realTimeTelemetry.rpm || 0)}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          RPM
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={6} md={3}>
                      <Box textAlign="center">
                        <Typography variant="h4" className="gear-indicator">
                          {realTimeTelemetry.gear || 'N'}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Marcia
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={6} md={3}>
                      <Box textAlign="center">
                        <Typography variant="h4">
                          {Math.round((realTimeTelemetry.throttle || 0) * 100)}%
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Acceleratore
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
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