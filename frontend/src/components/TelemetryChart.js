import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

const TelemetryChart = () => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          📈 Grafici Telemetria
        </Typography>
        <Box 
          sx={{ 
            height: 300, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'action.hover',
            borderRadius: 1
          }}
        >
          <Typography variant="h6" color="textSecondary">
            Grafici in sviluppo...
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TelemetryChart;
