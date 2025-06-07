import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Box, Divider 
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Timeline as SessionsIcon,
  Analytics as AnalyticsIcon,
  Compare as ComparisonIcon,
  RadioButtonChecked as LiveIcon,
  Settings as SettingsIcon,
  Speed as LogoIcon
} from '@mui/icons-material';

const DRAWER_WIDTH = 240;

const navigationItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Live', icon: <LiveIcon />, path: '/live' },
  { text: 'Sessioni', icon: <SessionsIcon />, path: '/sessions' },
  { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics' },
  { text: 'Confronti', icon: <ComparisonIcon />, path: '/comparison' }
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <LogoIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
          Racing Analytics
        </Typography>
      </Box>

      <Divider />

      <List sx={{ px: 1, py: 2 }}>
        {navigationItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => navigate(item.path)}
              selected={location.pathname === item.path}
              sx={{ borderRadius: 2 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <List sx={{ px: 1, pb: 2 }}>
        <Divider sx={{ mb: 1 }} />
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => navigate('/settings')}
            selected={location.pathname === '/settings'}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon><SettingsIcon /></ListItemIcon>
            <ListItemText primary="Impostazioni" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default Sidebar;
