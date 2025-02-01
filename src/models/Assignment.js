// src/models/Assignment.js
import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    solution: String,
    type: {
        type: String,
        enum: ['math', 'multiple-choice'],
        default: 'math'
    }
});

const assignmentSchema = new mongoose.Schema({
    classroomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Classroom',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxLength: 200
    },
    description: {
        type: String,
        trim: true,
        maxLength: 1000
    },
    dueDate: {
        type: Date
    },
    questions: [questionSchema],
    active: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Method to add a question
assignmentSchema.methods.addQuestion = async function(questionData) {
    this.questions.push(questionData);
    await this.save();
    return this.questions[this.questions.length - 1];
};

const Assignment = mongoose.model('Assignment', assignmentSchema);

export default Assignment;