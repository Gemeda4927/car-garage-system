const express = require('express');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/auth.routes');
const garageRoutes = require('./routes/garage.routes');
const bookingRoutes = require('./routes/booking.routes');
const reviewRoutes = require('./routes/review.routes');

const app = express();

// =====================================
// MIDDLEWARE
// =====================================
app.use(cors());                    // Enable CORS for all routes
app.use(express.json());             // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// =====================================
// API ROUTES
// =====================================
app.use('/api/v1/auth', authRoutes);        // Authentication endpoints
app.use('/api/v1/garages', garageRoutes);    // Garage management endpoints
app.use('/api/v1/bookings', bookingRoutes);  // Booking management endpoints
app.use('/api/v1/reviews', reviewRoutes);    // Reviews endpoints




// =====================================
// ERROR HANDLING MIDDLEWARE
// =====================================
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  const statusCode = err.status || 500;
  const message = err.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err.toString()
    })
  });
});

module.exports = app;