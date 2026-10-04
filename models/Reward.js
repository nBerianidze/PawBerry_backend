const mongoose = require("mongoose");

const historyItemSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
            trim: true
        },
        points: {
            type: Number,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const rewardSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        points: {
            type: Number,
            default: 0,
            min: 0
        },
        history: {
            type: [historyItemSchema],
            default: []
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Reward", rewardSchema);
