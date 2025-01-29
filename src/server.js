// src/server.js
import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { setupPassport } from './middleware/auth.js';
import topicsRouter from './routes/topics.js';
import problemsRouter from './routes/problems.js';
import authRouter from './routes/auth.js';
import Groq from 'groq-sdk';

// ES modules require these to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Connect to MongoDB
const mongoUrl = process.env.MONGODB_URI;
mongoose.connect(mongoUrl)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    if (err.code === 8000) {
      console.error('Authentication failed. Please check your username and password');
    }
  });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware for POST requests
app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log('POST Request Body:', req.body);
    }
    next();
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: mongoUrl,
        ttl: 24 * 60 * 60 // Session TTL (1 day)
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
setupPassport();

// Handlebars setup
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        json: function(context) {
            return JSON.stringify(context);
        },
        eq: function(a, b) {
            return a === b;
        },
        add: function(a, b) {
            return parseInt(a) + parseInt(b);
        },
        subtract: function(a, b) {
            return parseInt(a) - parseInt(b);
        },
        toString: function(value) {
            return value.toString();
        }
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', authRouter);
app.use('/topics', topicsRouter);
app.use('/problems', problemsRouter);

// Root route
app.get('/', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    res.render('home', {
        title: 'Math Learning Platform',
        isHome: true,
        user: req.user
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});