// src/models/UserProgress.js
import mongoose from 'mongoose';

const solutionSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    mode: {
        type: String,
        enum: ['text', 'latex', 'canvas'],
        default: 'text'
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    feedback: {
        type: String
    }
});

const problemProgressSchema = new mongoose.Schema({
    problemId: {
        type: String,
        required: true,
        ref: 'Problem'
    },
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed'],
        default: 'not_started'
    },
    attempts: {
        type: Number,
        default: 0
    },
    solutions: [solutionSchema],
    lastAttemptAt: {
        type: Date
    }
});

const userProgressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    problemProgress: [problemProgressSchema],
    topicProgress: {
        type: Map,
        of: {
            completed: Number,
            attempted: Number,
            lastAccessedAt: Date
        }
    }
}, {
    timestamps: true
});

// Index for efficient queries
userProgressSchema.index({ userId: 1, 'problemProgress.problemId': 1 });

// Method to update problem progress
userProgressSchema.methods.updateProblemProgress = async function(problemId, solution, status) {
    const problemProgress = this.problemProgress.find(p => p.problemId === problemId);
    
    if (!problemProgress) {
        this.problemProgress.push({
            problemId,
            status,
            attempts: 1,
            solutions: [solution],
            lastAttemptAt: new Date()
        });
    } else {
        problemProgress.status = status;
        problemProgress.attempts += 1;
        problemProgress.solutions.push(solution);
        problemProgress.lastAttemptAt = new Date();
    }

    await this.save();
};

const UserProgress = mongoose.model('UserProgress', userProgressSchema);

export default UserProgress;