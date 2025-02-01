// src/models/StudentAssignment.js
import mongoose from 'mongoose';

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
    submittedAt: {
        type: Date,
        default: Date.now
    },
    isComplete: {
        type: Boolean,
        default: false
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

// Index for efficient queries
studentAssignmentSchema.index({ studentId: 1, assignmentId: 1 }, { unique: true });

// Method to add or update a submission
studentAssignmentSchema.methods.addSubmission = async function(questionId, work, mode) {
    const submissionIndex = this.submissions.findIndex(
        s => s.questionId.equals(questionId)
    );
    
    if (submissionIndex === -1) {
        this.submissions.push({ questionId, work, mode });
    } else {
        this.submissions[submissionIndex].work = work;
        this.submissions[submissionIndex].mode = mode;
        this.submissions[submissionIndex].submittedAt = new Date();
    }
    
    // Update status
    if (this.submissions.every(s => s.isComplete)) {
        this.status = 'completed';
        this.completedAt = new Date();
    } else if (this.submissions.length > 0) {
        this.status = 'in_progress';
    }
    
    await this.save();
};

// Method to mark a question as complete
studentAssignmentSchema.methods.markQuestionComplete = async function(questionId) {
    const submission = this.submissions.find(s => s.questionId.equals(questionId));
    if (submission) {
        submission.isComplete = true;
        
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
    }
};

const StudentAssignment = mongoose.model('StudentAssignment', studentAssignmentSchema);

export default StudentAssignment;