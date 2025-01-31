// src/models/Problem.js
import mongoose from 'mongoose';

const problemSchema = new mongoose.Schema({
    problemId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    originalId: {
        type: String,
        required: true
    },
    topic: { 
        type: String, 
        required: true,
        index: true
    },
    level: { 
        type: Number, 
        required: true,
        min: 0,
        default: 0
    },
    type: String,
    problem: { 
        type: String, 
        required: true 
    },
    solution: String,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Add compound index for topic and originalId
problemSchema.index({ topic: 1, originalId: 1 });

const Problem = mongoose.model('Problem', problemSchema);

export default Problem;