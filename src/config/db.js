// src/config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Get MongoDB URI from environment variables with fallback
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mathlearning';
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: true
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

export default connectDB;