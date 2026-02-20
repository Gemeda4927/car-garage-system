const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    garage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Garage',
      required: true,
      index: true
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date
    },

    services: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Service'
        },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        duration: { type: Number }
      }
    ],

    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },

    appointmentDate: {
      type: Date,
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'in_progress',
        'completed',
        'cancelled',
        'rejected'
      ],
      default: 'pending'
    },

    /*
    ========================
          PAYMENT SECTION
    ========================
    */

    payment: {
      method: {
        type: String,
        enum: ['cash', 'chapa'],
        default: 'chapa'
      },

      status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
      },

      tx_ref: {
        type: String,
        unique: true,
        sparse: true
      },

      chapaReference: {
        type: String
      },

      amountPaid: {
        type: Number
      },

      paidAt: {
        type: Date
      }
    },

    notes: String,

    cancelledAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

// bookingSchema.index({ user: 1 });
// bookingSchema.index({ garage: 1 });
// bookingSchema.index({ appointmentDate: 1 });
// bookingSchema.index({ 'payment.tx_ref': 1 });

module.exports = mongoose.model('Booking', bookingSchema);