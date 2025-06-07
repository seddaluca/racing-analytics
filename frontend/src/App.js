import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { Toaster } from 'react-hot-toast';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Pages
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Analytics from './pages/Analytics';
import Comparison from './pages/Comparison';
import LiveTelemetry from './pages/LiveTelemetry';
import Settings from './pages/Settings';

// Services
import { connectWebSocket, disconnectWebSocket } from './services/websocket';

// Styles
import './App.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Theme configuration
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff6b00',
      light: '#ff8533',
      dark: '#cc5500',
    },
    secondary: {
      main: '#00bcd4',
      light: '#33c9dc',
      dark: '#0097a7',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
    success: {
      main: '#4caf50',
    },
    warning: {
      main: '#ff9800',
    },
    error: {
      main: '#f44336',
    },
  },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Arial', 'sans-serif'].join(','),
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h4: {
      fontWeight: 500,
      fontSize: '1.25rem',
    },
    h5: {
      fontWeight: 500,
      fontSize: '1.1rem',
    },
    h6: {
      fontWeight: 500,
      fontSize: '1rem',
    },
    body1: {
      fontSize: '0.95rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #2a2a2a',
          backgroundColor: '#1a1a1a',
        },
      },
    },
  },
});

function App() {
  useEffect(() => {
    // Connect to WebSocket for real-time updates
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, []);

  // Hide loading screen
  useEffect(() => {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.display = 'none';
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <Sidebar />

            {/* Main content */}
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <Header />

              {/* Page content */}
              <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto' }}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/sessions" element={<Sessions />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/comparison" element={<Comparison />} />
                  <Route path="/live" element={<LiveTelemetry />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Box>
            </Box>
          </Box>
        </Router>

        {/* Toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#2a2a2a',
              color: '#fff',
              border: '1px solid #3a3a3a',
            },
            success: {
              iconTheme: {
                primary: '#4caf50',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#f44336',
                secondary: '#fff',
              },
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;