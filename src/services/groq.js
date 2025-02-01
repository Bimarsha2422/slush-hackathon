// src/services/groq.js
import Groq from 'groq-sdk';

class GroqService {
    constructor() {
        this.client = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }

    async analyzeStudentWork(work, hints, mode = 'text') {
        try {
            const promptTemplate = `
You are analyzing a student's mathematical work. Provide feedback in a structured format.
Consider:
1. Three specific strengths in their approach
2. Three specific areas for improvement
3. How effectively hints were used (${hints.length} hints requested)
4. Overall mathematical understanding

${mode === 'canvas' ? 'Note: This is a handwritten submission - evaluate clarity and organization in addition to mathematical correctness.' : ''}

Return a JSON object with the following structure:
{
    "strengths": ["strength1", "strength2", "strength3"],
    "improvements": ["improvement1", "improvement2", "improvement3"],
    "analysis": "2-3 sentence summary of overall work quality and understanding"
}`;

            const chatCompletion = await this.client.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: promptTemplate
                    },
                    {
                        role: "user",
                        content: `Student's work:\n${work}\n\nHints used:\n${hints.map(h => h.content).join('\n')}`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.3,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            const feedback = JSON.parse(chatCompletion.choices[0].message.content);
            
            return {
                strengths: feedback.strengths,
                improvements: feedback.improvements,
                aiAnalysis: feedback.analysis
            };
        } catch (error) {
            console.error('Error generating AI analysis:', error);
            return {
                strengths: ['Unable to analyze strengths at this time.'],
                improvements: ['Unable to analyze improvements at this time.'],
                aiAnalysis: 'Error generating detailed feedback.'
            };
        }
    }

    async generateClassReport(assignmentId, questionId, submissions) {
        try {
            const promptTemplate = `
Analyze these student submissions for a math question and provide a comprehensive class report.
Consider:
1. Overall performance patterns
2. Common strengths
3. Common difficulties
4. Specific misconceptions
5. Teaching recommendations

Return a JSON object with the following structure:
{
    "performancePatterns": {
        "summary": "Overall performance summary",
        "keyPatterns": ["pattern1", "pattern2", "pattern3"]
    },
    "commonStrengths": ["strength1", "strength2", "strength3"],
    "commonDifficulties": ["difficulty1", "difficulty2", "difficulty3"],
    "misconceptions": ["misconception1", "misconception2", "misconception3"],
    "teachingRecommendations": ["recommendation1", "recommendation2", "recommendation3"],
    "overallSummary": "2-3 sentence summary of class performance"
}`;

            const submissionsText = submissions.map(sub => 
                `Student ${sub.studentId}:\n${sub.work}\nHints used: ${sub.hints.length}\n`
            ).join('\n---\n');

            const chatCompletion = await this.client.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: promptTemplate
                    },
                    {
                        role: "user",
                        content: `Class Submissions:\n${submissionsText}`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.3,
                max_tokens: 2000,
                response_format: { type: "json_object" }
            });

            const report = JSON.parse(chatCompletion.choices[0].message.content);

            return {
                ...report,
                timestamp: new Date(),
                submissionCount: submissions.length
            };
        } catch (error) {
            console.error('Error generating class report:', error);
            throw error;
        }
    }
}

export const groqService = new GroqService();