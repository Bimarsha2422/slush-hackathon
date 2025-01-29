// src/middleware/auth.js
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import User from '../models/User.js';

export function setupPassport() {
  // Serialize user for the session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Local Strategy
  passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      const isMatch = await user.comparePassword(password);
      
      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

// Middleware to check if user is authenticated
export function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}

// Middleware to check if user is a teacher
export function isTeacher(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'teacher') {
    return next();
  }
  res.status(403).render('error', { message: 'Access denied. Teachers only.' });
}

// Middleware to check if user is a student
export function isStudent(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'student') {
    return next();
  }
  res.status(403).render('error', { message: 'Access denied. Students only.' });
}