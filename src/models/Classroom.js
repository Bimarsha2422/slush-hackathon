// src/models/Classroom.js
import mongoose from 'mongoose';
import crypto from 'crypto';

const classroomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Classroom name is required'],
        trim: true,
        maxLength: 100
    },
    description: {
        type: String,
        trim: true,
        maxLength: 500
    },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    code: {
        type: String,
        unique: true,
        default: () => crypto.randomBytes(3).toString('hex').toUpperCase()
    },
    active: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Method to generate a new unique join code
classroomSchema.methods.generateNewCode = async function() {
    let newCode;
    let isUnique = false;
    
    while (!isUnique) {
        newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        const existingClass = await mongoose.models.Classroom.findOne({ code: newCode });
        if (!existingClass) {
            isUnique = true;
        }
    }
    
    this.code = newCode;
    await this.save();
    return newCode;
};

// Method to add a student
classroomSchema.methods.addStudent = async function(studentId) {
    if (!this.students.includes(studentId)) {
        this.students.push(studentId);
        await this.save();
    }
};

// Method to remove a student
classroomSchema.methods.removeStudent = async function(studentId) {
    this.students = this.students.filter(id => !id.equals(studentId));
    await this.save();
};

const Classroom = mongoose.model('Classroom', classroomSchema);

export default Classroom;