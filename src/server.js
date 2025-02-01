// src/server.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk'; 
import connectDB from './config/db.js';
import Problem from './models/Problem.js';

// Import routes
// Import routes
import topicsRouter from './routes/topics.js';            // UI routes
import problemsRouter from './routes/problems.js';        // UI routes
import topicsApiRouter from './routes/api/topics.js';     // API routes  
import problemsApiRouter from './routes/api/problems.js'; // API routes
import authRouter from './routes/auth.js';
import classroomApiRouter from './routes/api/classroom.js';
import assignmentsApiRouter from './routes/api/assignments.js';
import progressApiRouter from './routes/api/progress.js';
import teacherRouter from './routes/teacher.js';
import studentRouter from './routes/student.js';          // Add this line

// ES modules require these to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.use(express.json()); 
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/topics', topicsRouter);     // For rendering topic pages
app.use('/problems', problemsRouter);  // For rendering problem pages

// API Routes
app.use('/api/topics', topicsApiRouter);    // For topic data
app.use('/api/problems', problemsApiRouter); // For problem data


app.use('/api/classrooms', classroomApiRouter);
app.use('/api/assignments', assignmentsApiRouter);
app.use('/api/progress', progressApiRouter);
app.use('/teacher', teacherRouter);
app.use('/student', studentRouter); 

// In src/server.js, update the Handlebars configuration
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
        notEq: function(a, b) {          // Add this new helper
            return a !== b;
        },
        add: function(a, b) {
            return parseInt(a) + parseInt(b);
        },
        subtract: function(a, b) {
            return parseInt(a) - parseInt(b);
        },
        toString: function(value) {
            return value.toString();
        },
        isPastDue: function(date) {
            if (!date) return false;
            return new Date(date) < new Date();
        },
        // Add this in server.js where other helpers are defined
        lookup: function(obj, key) {
            return obj && obj[key];
        },
        formatDate: function(date) {
            if (!date) return '';
            return new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },
        initials: function(name) {
            return name.split(' ')
                .map(part => part[0])
                .join('')
                .toUpperCase();
        },
        pageUrl: function(baseUrl, page, level) {
            const params = new URLSearchParams();
            params.set('page', page);
            if (level && level !== 'all') {
                params.set('level', level);
            }
            return `${baseUrl}?${params.toString()}`;
        }
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/topics', topicsRouter);
app.use('/problems', problemsRouter);


// Auth page route
app.get('/auth', (req, res) => {
    res.render('auth', {
        title: 'Login or Register - Math Learning Platform'
    });
});

app.get('/api/test', async (req, res) => {
  try {
    const count = await Problem.countDocuments();
    res.json({ 
      message: 'MongoDB connection successful', 
      problemCount: count 
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/', (req, res) => {
    res.render('home', {
        title: 'Math Learning Platform',
        isHome: true
    });
});

// In src/server.js - Update the help API endpoint

app.post('/api/help', async (req, res) => {
    const { helpType, problem, work, query, hintHistory, isCanvasMode, assignmentContext } = req.body;
    
    try {
        // If this is an assignment submission and it's a validation request
        if (assignmentContext && helpType === 'validate') {
            await StudentAssignment.findOneAndUpdate({
                studentId: req.user._id,
                assignmentId: assignmentContext.assignmentId
            }, {
                $set: {
                    status: 'in_progress',
                    lastSubmission: {
                        work: work,
                        submittedAt: new Date()
                    }
                }
            }, { upsert: true });
        }

        // Use same system messages but with assignment context
        const systemMessages = {
            hint: `You are helping a student with ${assignmentContext ? 'an assignment' : 'a math problem'}. 
                  Give one brief, focused hint. ${assignmentContext ? 'Consider this is for a class assignment.' : ''}
                  Be concise but make sure your explanation is complete.
                  Act as a Socrates-style tutor. NEVER give direct answers.`,
            // ... rest of your system messages
        };

        const chatCompletion = await client.chat.completions.create({
            messages: [
                { role: "system", content: systemMessages[helpType] },
                { role: "user", content: userMessage }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3
        });

        // If this was a successful validation for an assignment
        if (assignmentContext && helpType === 'validate' && 
            chatCompletion.choices[0].message.content.toLowerCase().includes('correct')) {
            await StudentAssignment.findOneAndUpdate({
                studentId: req.user._id,
                assignmentId: assignmentContext.assignmentId
            }, {
                $set: {
                    status: 'completed',
                    completedAt: new Date()
                }
            });
        }

        res.json({ response: chatCompletion.choices[0].message.content });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate response',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
await connectDB();
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
