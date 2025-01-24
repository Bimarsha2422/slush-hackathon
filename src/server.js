// src/server.js
import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import topicsRouter from './routes/topics.js';  // Note the .js extension
import problemsRouter from './routes/problems.js';
import Groq from 'groq-sdk'; 

// ES modules require these to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.use(express.json()); 

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
        merge: function(obj1, obj2) {
            return { ...obj1, ...obj2 };
        },
        buildUrl: function(baseUrl, params) {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                searchParams.append(key, value);
            }
            return `${baseUrl}?${searchParams.toString()}`;
        },
        object: function() {
            const args = Array.from(arguments);
            const obj = {};
            for (let i = 0; i < args.length - 1; i += 2) {
                obj[args[i]] = args[i + 1];
            }
            return obj;
        }
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/topics', topicsRouter);
app.use('/problems', problemsRouter);

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
                  Always use LaTeX formatting for mathematical expressions:
                  - Use \\( and \\) for inline math
                  - Use \\[ and \\] for displayed math
                  - Use $ only if already present in the original problem
                  - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                  - Use simple line breaks and \\[ \\] for multiple lines instead
                  Previous hints given: ${hintHistory?.map(h => h.content).join(' → ') || 'None'}`,
            
            nextStep: `You are helping a student solve a math problem. Suggest the next step.
                      Be concise but do not give out the full solution. Only give the next mini-step. 
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
                      If work seems partial, briefly confirm correctness and indicate next step.
                      If work seems complete, verify the answer concisely.
                      Focus on key points rather than lengthy explanations.`,
            
            improve: `You are improving a student's math solution. 
                     Write like a good student: clear, natural, and complete but not verbose.
                     Always use LaTeX formatting:
                     - Use \\( and \\) for inline math
                     - Use \\[ and \\] for displayed math
                     - Use $ only if already present in the original problem
                     - Directly give the solution without using phrases like here's the written solution. 
                     - DO NOT use \\begin{align}, \\begin{equation}, or similar environments
                     - Use simple line breaks and \\[ \\] for multiple lines instead
                     Maintain mathematical rigor while keeping the tone natural.`
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
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});