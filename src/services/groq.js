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

    async generateClassReport(questionContent, submissions, stats) {
        try {
            const promptTemplate = `
    You are analyzing student submissions for a math question. Generate a comprehensive class report.
    The question is: ${questionContent}
    
    Statistics:
    - Total submissions: ${stats.totalSubmissions}
    - Completed: ${stats.completed}
    - In Progress: ${stats.inProgress}
    - Average hints used: ${stats.averageHints}
    
    Based on the submissions provided, analyze:
    1. Overall performance patterns and trends
    2. Common strengths demonstrated by students
    3. Common difficulties and areas needing improvement
    4. Specific misconceptions identified
    5. Recommendations for teaching and intervention
    
    Format your response as a JSON object with the following structure:
    {
        "performancePatterns": {
            "summary": "2-3 sentence overview of class performance",
            "keyPatterns": ["pattern1", "pattern2", "pattern3"]
        },
        "commonStrengths": ["strength1", "strength2", "strength3"],
        "commonDifficulties": ["difficulty1", "difficulty2", "difficulty3"],
        "misconceptions": ["misconception1", "misconception2"],
        "teachingRecommendations": ["recommendation1", "recommendation2", "recommendation3"]
    }`;
    
            // Process submissions to include relevant information
            const submissionDetails = submissions.map(sub => ({
                status: sub.status,
                hintsUsed: sub.hintsUsed,
                workMode: sub.mode,
                hasSubmitted: Boolean(sub.work),
                hasFeedback: Boolean(sub.feedback),
                workSample: sub.work?.substring(0, 200) // Limit work sample size
            }));
    
            const chatCompletion = await this.client.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: promptTemplate
                    },
                    {
                        role: "user",
                        content: JSON.stringify(submissionDetails, null, 2)
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.3,
                max_tokens: 2000,
                response_format: { type: "json_object" }
            });
    
            let report = JSON.parse(chatCompletion.choices[0].message.content);
    
            // Ensure all required fields exist with defaults if needed
            report = {
                performancePatterns: {
                    summary: report.performancePatterns?.summary || "No performance summary available.",
                    keyPatterns: report.performancePatterns?.keyPatterns || []
                },
                commonStrengths: report.commonStrengths || [],
                commonDifficulties: report.commonDifficulties || [],
                misconceptions: report.misconceptions || [],
                teachingRecommendations: report.teachingRecommendations || [],
                submissionStats: stats,
                generatedAt: new Date()
            };
    
            return report;
        } catch (error) {
            console.error('Error in generateClassReport:', error);
            throw new Error('Failed to generate class report: ' + error.message);
        }
    }

}

export const groqService = new GroqService();