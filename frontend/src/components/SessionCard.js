import React from 'react';
import { Card, CardContent, Typography, Box, Chip } from '@mui/material';

const SessionCard = ({ session }) => {
  if (!session) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {session.circuit_name || 'Circuito Sconosciuto'}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {session.vehicle_name || 'Veicolo Sconosciuto'}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Chip label={session.game_mode || 'TIME_TRIAL'} size="small" />
        </Box>
      </CardContent>
    </Card>
  );
};

export default SessionCard;
