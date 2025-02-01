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