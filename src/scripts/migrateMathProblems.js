// src/scripts/migrateMathProblems.js
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import Problem from '../models/Problem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Corrected path: Go up from src/scripts to project root, then to MATH/train
const MATH_DIR = join(__dirname, '../../MATH/train');

async function migrateMathProblems() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/mathlearning', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Clear existing problems
        await Problem.deleteMany({});
        console.log('Cleared existing problems');

        // Get all topic directories
        const topics = await fs.readdir(MATH_DIR);
        console.log(`Found ${topics.length} topics:`, topics);

        let totalProblems = 0;
        let migratedProblems = 0;
        let errors = [];

        // Process each topic
        for (const topic of topics) {
            const topicPath = join(MATH_DIR, topic);
            const stat = await fs.stat(topicPath);
            
            if (!stat.isDirectory()) continue;

            // Get all JSON files in the topic directory
            const files = await fs.readdir(topicPath);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            totalProblems += jsonFiles.length;

            console.log(`\nProcessing ${jsonFiles.length} problems in ${topic}`);

            // Process each problem file
            for (const file of jsonFiles) {
                try {
                    const filePath = join(topicPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const problemData = JSON.parse(content);

                    // Create problemId that includes topic
                    const problemNumber = file.replace('.json', '');
                    const uniqueProblemId = `${topic}_${problemNumber}`;

                    // Log for debugging
                    console.log(`Creating problem with ID: ${uniqueProblemId}, Original ID: ${problemNumber}`);
                    
                    // Extract level number from "Level N" format
                    const levelMatch = (problemData.level || '').match(/Level (\d+)/);
                    const level = levelMatch ? parseInt(levelMatch[1]) : 0;

                    // Create and save the problem document
                    const problemDoc = {
                        problemId: uniqueProblemId,           // Now includes topic prefix
                        originalId: problemNumber,            // Store original number
                        topic: topic,
                        level: level,                         // Now just the number
                        type: problemData.type || topic,      // Use topic as type if not specified
                        problem: problemData.problem,
                        solution: problemData.solution || ''
                    };

                    console.log('Problem document:', problemDoc);
                    const problem = new Problem(problemDoc);

                    await problem.save();
                    migratedProblems++;
                    
                    if (migratedProblems % 10 === 0) {
                        process.stdout.write(`\rMigrated ${migratedProblems}/${totalProblems} problems`);
                    }

                } catch (error) {
                    errors.push({
                        topic,
                        file,
                        error: error.message
                    });
                    console.error(`\nError processing ${topic}/${file}:`, error.message);
                }
            }
        }

        console.log('\n\nMigration Summary:');
        console.log('-------------------');
        console.log(`Total topics processed: ${topics.length}`);
        console.log(`Total problems found: ${totalProblems}`);
        console.log(`Successfully migrated: ${migratedProblems}`);
        console.log(`Errors encountered: ${errors.length}`);

        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach(({topic, file, error}) => {
                console.log(`- ${topic}/${file}: ${error}`);
            });
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Run migration
migrateMathProblems().catch(console.error);