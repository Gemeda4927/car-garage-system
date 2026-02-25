const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const garageRoutes = require('./routes/garage.routes');
const bookingRoutes = require('./routes/booking.routes');
const reviewRoutes = require('./routes/review.routes');
const paymentRoutes = require('./routes/payment.routes'); 

const app = express();

app.use(cors());

// =====================================
// IMPORTANT: Webhook routes must come BEFORE express.json()
// =====================================
// Create a raw body parser for webhook routes
app.use('/api/v1/payments/webhook', express.raw({type: 'application/json'}));
app.use('/api/v1/payments/callback', express.raw({type: 'application/json'}));
app.use('/api/v1/payments/webhook-test', express.raw({type: 'application/json'}));

// =====================================
// REGULAR MIDDLEWARE (for all other routes)
// =====================================
app.use(express.json());            
app.use(express.urlencoded({ extended: true })); 

// =====================================
// API ROUTES
// =====================================
app.use('/api/v1/auth', authRoutes);        
app.use('/api/v1/garages', garageRoutes);    
app.use('/api/v1/bookings', bookingRoutes);  
app.use('/api/v1/reviews', reviewRoutes);    

// =====================================
// PAYMENT ROUTES - Special handling for webhooks
// =====================================
// Regular payment routes (protected by auth)
app.use('/api/v1/payments', express.json(), paymentRoutes);

// Webhook routes are already handled above with raw body
// They will be caught by the paymentRoutes router
app.use('/api/v1/payments', paymentRoutes);

module.exports = app;