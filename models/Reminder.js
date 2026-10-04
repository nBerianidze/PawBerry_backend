const mongoose = require("mongoose");

const REMINDER_TYPES = [
    "Vaccination",
    "Deworming",
    "Flea & Tick",
    "Medication",
    "Vet Appointment",
    "Feeding",
    "Grooming",
    "Other"
];

const REPEAT_OPTIONS = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

const reminderSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        pet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Pet",
            required: [true, "A reminder must belong to a pet"]
        },
        title: {
            type: String,
            required: [true, "Reminder title is required"],
            trim: true
        },
        type: {
            type: String,
            enum: {
                values: REMINDER_TYPES,
                message: "Invalid reminder type"
            },
            default: "Other"
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        date: {
            type: Date
        },
        time: {
            type: String,
            trim: true,
            default: ""
        },
        repeat: {
            type: String,
            enum: {
                values: REPEAT_OPTIONS,
                message: "Invalid repeat option"
            },
            default: "None"
        },
        completed: {
            type: Boolean,
            default: false
        },
        // Prevents awarding points more than once for the same reminder
        pointsAwarded: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

const Reminder = mongoose.model("Reminder", reminderSchema);

Reminder.REMINDER_TYPES = REMINDER_TYPES;
Reminder.REPEAT_OPTIONS = REPEAT_OPTIONS;

module.exports = Reminder;
