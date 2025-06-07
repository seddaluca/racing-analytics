import React from 'react';
import { AppBar, Toolbar, Typography, Box, Chip } from '@mui/material';
import { RadioButtonChecked as LiveIcon } from '@mui/icons-material';

const Header = () => {
  return (
    <AppBar 
      position="static" 
      color="default" 
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            icon={<LiveIcon />}
            label="Disconnesso"
            color="error"
            variant="outlined"
            size="small"
          />
          <Typography variant="body2" color="textSecondary">
            {new Date().toLocaleTimeString('it-IT')}
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
