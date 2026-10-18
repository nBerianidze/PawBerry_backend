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

const recurrenceSchema = new mongoose.Schema(
    {
        frequency: {
            type: String,
            default: "none"
        },
        interval: {
            type: Number,
            default: 1,
            min: 1
        },
        unit: {
            type: String,
            default: "day"
        },
        weekDays: {
            type: [Number],
            default: []
        },
        monthDay: {
            type: Number,
            default: null
        },
        ends: {
            type: String,
            default: "never"
        },
        endDate: {
            type: Date
        }
    },
    { _id: false }
);

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
        // Human-readable / legacy field. New clients also send `recurrence`.
        repeat: {
            type: String,
            default: "None"
        },
        recurrence: {
            type: recurrenceSchema,
            default: () => ({
                frequency: "none",
                interval: 1,
                unit: "day",
                weekDays: [],
                monthDay: null,
                ends: "never"
            })
        },
        completed: {
            type: Boolean,
            default: false
        },
        pointsAwarded: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

const Reminder = mongoose.model("Reminder", reminderSchema);

Reminder.REMINDER_TYPES = REMINDER_TYPES;

module.exports = Reminder;
