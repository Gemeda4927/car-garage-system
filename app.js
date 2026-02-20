const express = require('express');
const cors = require('cors');


const authRoutes = require('./routes/auth.routes');
const garageRoutes = require('./routes/garage.routes');
const bookingRoutes = require('./routes/booking.routes');
const reviewRoutes = require('./routes/review.routes');

const app = express();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/garages', garageRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);




module.exports = app;