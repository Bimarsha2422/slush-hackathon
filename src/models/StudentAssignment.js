// src/models/StudentAssignment.js
import mongoose from 'mongoose';

const hintSchema = new mongoose.Schema({
    content: String,
    timestamp: { type: Date, default: Date.now }
});

const submissionSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    work: {
        type: String,
        required: true
    },
    mode: {
        type: String,
        enum: ['text', 'latex', 'canvas'],
        default: 'text'
    },
    hints: [hintSchema],
    submittedAt: {
        type: Date,
        default: Date.now
    },
    isComplete: {
        type: Boolean,
        default: false
    },
    feedback: {
        strengths: [String],
        improvements: [String],
        hintsUsed: Number,
        submissionTime: Date,
        aiAnalysis: String
    }
});

const studentAssignmentSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assignment',
        required: true
    },
    classroomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Classroom',
        required: true
    },
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed'],
        default: 'not_started'
    },
    submissions: [submissionSchema],
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Method to add or update a submission
studentAssignmentSchema.methods.addSubmission = async function(questionId, work, mode) {
    const submissionIndex = this.submissions.findIndex(
        s => s.questionId.equals(questionId)
    );
    
    if (submissionIndex === -1) {
        this.submissions.push({ 
            questionId, 
            work, 
            mode,
            hints: []
        });
        this.status = 'in_progress';
    } else {
        this.submissions[submissionIndex].work = work;
        this.submissions[submissionIndex].mode = mode;
        this.submissions[submissionIndex].submittedAt = new Date();
    }
    
    await this.save();
};

// Method to add a hint to a question
studentAssignmentSchema.methods.addHint = async function(questionId, hintContent) {
    const submission = this.submissions.find(s => s.questionId.equals(questionId));
    if (submission) {
        submission.hints.push({ content: hintContent });
        await this.save();
    }
};

// Method to mark a question as complete with feedback
studentAssignmentSchema.methods.markQuestionComplete = async function(questionId, aiAnalysis) {
    const submission = this.submissions.find(s => s.questionId.equals(questionId));
    if (submission) {
        submission.isComplete = true;
        submission.feedback = {
            strengths: aiAnalysis.strengths || [],
            improvements: aiAnalysis.improvements || [],
            hintsUsed: submission.hints.length,
            submissionTime: new Date(),
            aiAnalysis: aiAnalysis.feedback
        };
        
        // Check if all questions are complete
        const assignment = await mongoose.model('Assignment').findById(this.assignmentId);
        const allComplete = assignment.questions.every(q => 
            this.submissions.find(s => 
                s.questionId.equals(q._id) && s.isComplete
            )
        );
        
        if (allComplete) {
            this.status = 'completed';
            this.completedAt = new Date();
        }
        
        await this.save();
        return submission.feedback;
    }
    return null;
};

const StudentAssignment = mongoose.model('StudentAssignment', studentAssignmentSchema);

export default StudentAssignment;