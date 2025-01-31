import mongoose from 'mongoose';

const problemSchema = new mongoose.Schema({
  problemId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  topic: { 
    type: String, 
    required: true,
    index: true  // Add index for faster topic-based queries
  },
  level: { 
    type: String, 
    required: true 
  },
  type: String,
  problem: { 
    type: String, 
    required: true 
  },
  solution: String,
  hints: [String],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Add indexes for common queries
problemSchema.index({ topic: 1, level: 1 });

const Problem = mongoose.model('Problem', problemSchema);

export default Problem;