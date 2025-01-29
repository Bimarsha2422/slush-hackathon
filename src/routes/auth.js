// src/routes/auth.js
import express from 'express';
import passport from 'passport';
import User from '../models/User.js';

const router = express.Router();

// GET /auth/login
router.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('auth', { 
        title: 'Login / Sign Up',
        noNav: true // To hide navigation if needed
    });
});

// POST /auth/login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return next(err);
        }
        if (!user) {
            return res.render('auth', { 
                error: info.message || 'Invalid credentials',
                loginData: { email: req.body.email },
                noNav: true
            });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }
            return res.redirect('/');
        });
    })(req, res, next);
});

// POST /auth/signup
router.post('/signup', async (req, res) => {
    try {
        console.log('Signup request body:', req.body);
        const { name, email, password, role } = req.body;
        
        // Validate required fields
        if (!name || !email || !password || !role) {
            return res.render('auth', {
                error: 'All fields are required',
                signupData: { name, email, role },
                noNav: true
            });
        }

        // Validate password length
        if (password.length < 6) {
            return res.render('auth', {
                error: 'Password must be at least 6 characters long',
                signupData: { name, email, role },
                noNav: true
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('auth', {
                error: 'Email already registered',
                signupData: { name, email, role },
                noNav: true
            });
        }

        // Create new user
        const user = new User({
            name,
            email: email.toLowerCase(),
            password,
            role
        });

        await user.save();
        console.log('User created successfully:', user);

        // Instead of logging in, redirect to login page with success message
        return res.render('auth', {
            success: 'Account created successfully! Please log in.',
            loginData: { email: email },  // Pre-fill the login email
            noNav: true
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.render('auth', {
            error: 'Error creating account. Please try again.',
            signupData: req.body,
            noNav: true
        });
    }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/auth/login');
    });
});

export default router;