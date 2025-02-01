// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error('No authentication token provided');
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user
        const user = await User.findOne({ _id: decoded._id, active: true });
        
        if (!user) {
            throw new Error('User not found');
        }

        // Add user to request
        req.user = user;
        req.token = token;
        
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

// Middleware for role-based access
export const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Please authenticate' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        next();
    };
};

// New middleware for page routes
export const authPage = (roles = []) => {
    return async (req, res, next) => {
        try {
            // Check for token in cookie or Authorization header
            const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
            
            if (!token) {
                return res.redirect('/auth');
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findOne({ _id: decoded._id, active: true });
            
            if (!user) {
                return res.redirect('/auth');
            }

            // Check role if specified
            if (roles.length && !roles.includes(user.role)) {
                return res.render('error', {
                    message: 'Access denied - insufficient permissions'
                });
            }

            req.user = user;
            req.token = token;
            next();
        } catch (error) {
            console.error('Auth error:', error);
            res.redirect('/auth');
        }
    };
};