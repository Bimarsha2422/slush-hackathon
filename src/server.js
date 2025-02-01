// src/server.js
import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk'; 
import connectDB from './config/db.js';
import Problem from './models/Problem.js';

// Import routes
import topicsRouter from './routes/topics.js';            // UI routes
import problemsRouter from './routes/problems.js';        // UI routes
import topicsApiRouter from './routes/api/topics.js';     // API routes
import problemsApiRouter from './routes/api/problems.js'; // API routes
import authRouter from './routes/auth.js';

// ES modules require these to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.use(express.json()); 

app.use('/api/auth', authRouter);
app.use('/topics', topicsRouter);     // For rendering topic pages
app.use('/problems', problemsRouter);  // For rendering problem pages

// API Routes
app.use('/api/topics', topicsApiRouter);    // For topic data
app.use('/api/problems', problemsApiRouter); // For problem data

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
        add: function(a, b) {
            return parseInt(a) + parseInt(b);
        },
        subtract: function(a, b) {
            return parseInt(a) - parseInt(b);
        },
        toString: function(value) {
            return value.toString();
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


app.post('/api/help', async (req, res) => {
    const { helpType, problem, work, query, hintHistory } = req.body;
    
    // Handle empty work for validate and improve
    if ((helpType === 'validate' || helpType === 'improve') && !work.trim()) {
        return res.json({ 
            response: "Please write your solution first before requesting feedback." 
        });
    }

    try {
        const systemMessages = {
            hint: `You are helping a student solve a math problem. Give one brief, focused hint.
                  Be concise but make sure your explanation is complete.
                  Act as a Socrates-style tutor. NEVER give direct answers.
                - Ask 2-3 short, guided questions maximum
                - Focus on identifying missing conceptual links
                - Example: "What relationship between X and Y are we missing here?"
                - Example: "Which theorem applies to this type of equation?"
                - NEVER solve any part of the problem
                - Prevent solution revelation by 3 layers of abstraction
                - Format: Always end with a question mark
                - Use LaTeX ONLY when referencing original problem's notation
                  Always use LaTeX formatting for mathematical expressions:
                  - Use \\( and \\) for inline math
                  - Use \\[ and \\] for displayed math
                  - Use $ only if already present in the original problem
                  - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                  - Use simple line breaks and \\[ \\] for multiple lines instead
                  
                  Previous hints given: ${hintHistory?.map(h => h.content).join(' → ') || 'None'}`,
            
            nextStep: `You are helping a student solve a math problem. Suggest the next step.
                      Be concise but do not give out the full solution. Only give the next mini-step. 
                      Guide to the immediate next technical step.
                    - Provide ONLY the next mathematical operation/step
                    - Example: "Apply distributive property to the left side"
                    - Example: "Isolate the quadratic term"
                      Always use LaTeX formatting:
                      - Use \\( and \\) for inline math
                      - Use \\[ and \\] for displayed math
                      - Use $ only if already present in the original problem
                      - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                      - Use simple line breaks and \\[ \\] for multiple lines instead
                      - Directly give the next step without using phrases like here's the next step.`,
            
            validate: `You are checking a student's math work. 
                      Always use LaTeX formatting for mathematical expressions:
                      - Use \\( and \\) for inline math
                      - Use \\[ and \\] for displayed math
                      - Use $ only if already present in the original problem
                      - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                      - Use simple line breaks and \\[ \\] for multiple lines instead
                      If work seems partial, briefly confirm correctness and acknowledge that the solution needs to be completed.
                      If work seems complete, verify the answer concisely.
                      Focus on key points rather than lengthy explanations.
                      DO NOT SUGGEST NEXT STEPS. JUST VERIFY AND THAT IS IT. 
                      Analyze the student's work to:
                    1. CONFIRM CORRECT elements (be specific)
                    2. IDENTIFY UNCLEAR/WRONG elements (be precise)
                    3. EXPLAIN WHY elements are correct/incorrect
                    4. NEVER SUGGEST next steps or solutions

                    Rules:
                    - Use "correct" only for verified right elements
                    - Never use "should", "next", or "need to"`,
            
            improve: `You are improving a student's math solution. 
                     Write like a good student: clear, natural, and complete but not verbose.
                     Always use LaTeX formatting:
                     - Use \\( and \\) for inline math
                     - Use \\[ and \\] for displayed math
                     - Use $ only if already present in the original problem
                     - Directly give the solution without using phrases like here's the written solution. 
                     - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                     - Use simple line breaks and \\[ \\] for multiple lines instead

                     Restructure the student's EXACT CONTENT into better format:
                    1. Fix grammar/syntax errors
                    2. Improve mathematical notation consistency
                    3. Enhance visual organization
                    4. PRESERVE ALL ORIGINAL CONTENT even if wrong
                    - Never add explanations/fixes
                    - Example: Convert run-on sentences to bullet points
                    - Maintain original variable names/values`
        };

        let userMessage = `Problem: ${problem.problem}\n\n`;
        userMessage += work ? `Student's work: ${work}\n\n` : '';
        userMessage += query ? `Student's question: ${query}` : '';
        
        // Only include hint history for hint type
        if (helpType === 'hint' && hintHistory?.length > 0) {
            userMessage += `\n\nPrevious hints:\n${hintHistory.map(h => h.content).join('\n')}`;
        }

        const chatCompletion = await client.chat.completions.create({
            messages: [
                { role: "system", content: systemMessages[helpType] },
                { role: "user", content: userMessage }
            ],
            model: "llama3-70b-8192",
            temperature: 0.3
        });

        console.log("GROQ Response:", chatCompletion.choices[0].message.content);

        res.json({ response: chatCompletion.choices[0].message.content });
    } catch (error) {
        console.error('GROQ API Error:', error);
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