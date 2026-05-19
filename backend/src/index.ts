import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Initialize database first
import './database';
import { seed } from './seed';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import facilityRoutes from './routes/facilities';
import bookingRoutes from './routes/bookings';
import notificationRoutes from './routes/notifications';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Run seed
seed();

app.listen(PORT, () => {
  console.log(`[Server] Village Hall Booking API running on port ${PORT}`);
  console.log(`[Server] Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export default app;
