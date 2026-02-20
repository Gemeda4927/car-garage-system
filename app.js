const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const garageRoutes = require('./routes/garage.routes');
const bookingRoutes = require('./routes/booking.routes');

const app = express();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/garages', garageRoutes);      
app.use('/api/v1/bookings', bookingRoutes);    



// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!' 
  });
});

module.exports = app;
