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
import topicsRouter from './routes/topics.js';            // UI routes
import problemsRouter from './routes/problems.js';        // UI routes
import topicsApiRouter from './routes/api/topics.js';     // API routes
import problemsApiRouter from './routes/api/problems.js'; // API routes
import authRouter from './routes/auth.js';
import classroomApiRouter from './routes/api/classroom.js';
import assignmentsApiRouter from './routes/api/assignments.js';
import progressApiRouter from './routes/api/progress.js';
import teacherRouter from './routes/teacher.js';
import studentRouter from './routes/student.js';

// ES modules require these to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});



app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Add this near the top of your middleware stack
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

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
        add: function(a, b) {
            return parseInt(a) + parseInt(b);
        },
        subtract: function(a, b) {
            return parseInt(a) - parseInt(b);
        },
        toString: function(value) {
            return value.toString();
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
        }, 
        formatStatus: function(status) {
            const statusMap = {
                'not_started': 'Not Started',
                'in_progress': 'In Progress',
                'completed': 'Completed'
            };
            return statusMap[status] || status;
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
    const { helpType, problem, work, query, hintHistory, isCanvasMode } = req.body;
    
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
            
            validate: `You are a STRICT validator who checks current progress of problem for handwritten math.
                          Your role is to confirm if their work is correct or incorrect upto the current point.    
            - JUST STATE WHETHER IT IS CORRECT OR INCORRECT OR UNCLEAR upto this point and explain why briefly
            - NEVER mention correct calculations
            - NEVER show proper solutions
            - NEVER explain how to fix errors
            - ONLY state what you observe and why is it correct or incorrect or unclear

            EXAMPLE VALID OUTPUT:
            "The calculation is correct upto now because the student formulated the equation correctly."
            "The student's work is incorrect because they forgot to ..."
            "The student work is unclear "
            
            EXAMPLE INVALID OUTPUT:
            "The correct calculation should be..."
            "It should have used 2.4 instead..."
            "They need to multiply by..."
            
            ANY SOLUTIONS OR CALCULATIONS = FAILED RESPONSE`,
            
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

        const visionSystemMessages = {
            hint: `You are analyzing handwritten mathematical work. Your ONLY role is to give ONE brief, focused hint.
                   NEVER provide solutions or answers - act strictly as a Socratic tutor.
                   
                   Visual Analysis Rules:
                   - Identify KEY mathematical concepts in the handwriting
                   - Look for patterns or relationships they may have missed
                   - Pay attention to errors or misconceptions in their work
                   
                   Hint Requirements:
                   - Ask EXACTLY ONE guided question about their work
                   - Focus ONLY on helping them discover the next insight
                   - NEVER reveal steps or solutions
                   - ALWAYS point to specific elements you see in their work
                   - End with a thought-provoking question
                   
                   Format Requirements:
                   - Use LaTeX when referencing their written math: \\( inline math \\) or \\[ displayed math \\]
                   - MUST end with a question mark
                   - Keep hint brief and focused
                   - NO solutions or direct answers
                   
                   Previous hints given: ${hintHistory?.map(h => h.content).join(' → ') || 'None'}`,
        
            nextStep: `You are analyzing handwritten mathematical work. Your ONLY role is to suggest the IMMEDIATE next step.
                       DO NOT solve or explain - only point to the next operation.
                       
                       Analysis Rules:
                       - Look ONLY at where their work stops
                       - Focus on the SINGLE next logical operation
                       - NO explanations or teaching
                       
                       Response Requirements:
                       - Give ONLY ONE specific next step
                       - Base it DIRECTLY on their last written step
                       - Be extremely concise (1-2 sentences maximum)
                       - NO solutions or multiple steps ahead
                       
                       Format Requirements:
                       - Use LaTeX for math: \\( inline \\) or \\[ displayed \\]
                       - Point to specific elements in their work
                       - Just state the next step - no explanation`,
        
            validate: `You are analyzing handwritten mathematical work. Your ONLY role is to check correctness.
                       DO NOT give hints or suggest improvements.
                       
                       Check These ONLY:
                       1. Are written equations correct?
                       2. Are mathematical steps valid?
                       3. Is notation used properly?
                       4. Are calculations accurate?
                       
                       Response Requirements:
                       - State ONLY what is correct/incorrect
                       - Give specific reasons for errors
                       - NO suggestions for fixing
                       - NO hints or next steps
                       
                       Format Requirements:
                       - Use LaTeX when quoting their work
                       - Be precise about what you're checking
                       - Focus purely on verification`,
        
            improve: `You are analyzing handwritten mathematical work. Your ONLY role is to improve presentation.
                      Focus EXCLUSIVELY on organization and clarity.
                      
                      Look ONLY at:
                      1. Layout and spacing
                      2. Notation consistency
                      3. Step organization
                      4. Visual clarity
                      
                      Improvement Rules:
                      - Comment ONLY on presentation
                      - NO feedback on mathematical correctness
                      - NO suggestions about problem-solving
                      - NEVER add new content
                      
                      Format Requirements:
                      - Use LaTeX for notation examples
                      - Focus on visual aspects
                      - Suggest organization improvements only`
        };

        if (isCanvasMode) {
            // For canvas mode, prepare the image data
            const base64Image = work.replace(/^data:image\/png;base64,/, '');
            

            const chatCompletion = await client.chat.completions.create({
                model: "llama-3.2-90b-vision-preview",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `${visionSystemMessages[helpType]}
                                      Problem: ${problem.problem}${query ? `\nStudent's question: ${query}` : ''}`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 1024,
            });

            res.json({ response: chatCompletion.choices[0].message.content });
        } else {

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
            model: "llama-3.3-70b-versatile",
            temperature: 0.3
        });

        console.log("GROQ Response:", chatCompletion.choices[0].message.content);

        res.json({ response: chatCompletion.choices[0].message.content });
        }
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
