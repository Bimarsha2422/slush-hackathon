import Groq from 'groq-sdk';

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Add API endpoint
app.post('/api/hint', async (req, res) => {
    const { problem, work } = req.body;
    
    try {
        const chatCompletion = await client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a math tutor. Provide a very brief, single-sentence hint that guides the student toward the solution without giving it away."
                },
                {
                    role: "user",
                    content: `Problem: ${problem.problem}\nStudent's work: ${work || 'No work shown yet.'}\nProvide a brief hint.`
                }
            ],
            model: "llama3-70b-8192",
            temperature: 0.3,
        });

        res.json({ hint: chatCompletion.choices[0].message.content });
    } catch (error) {
        console.error('GROQ API Error:', error);
        res.status(500).json({ error: 'Failed to generate hint' });
    }
});