import React from 'react';
import { Box, Grid, Card, CardContent, Skeleton } from '@mui/material';

const LoadingSkeleton = () => {
  return (
    <Box>
      <Grid container spacing={3}>
        {[1, 2, 3, 4].map((item) => (
          <Grid item xs={12} md={3} key={item}>
            <Card>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="80%" height={40} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default LoadingSkeleton;
