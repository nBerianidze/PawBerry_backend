const Reminder = require("../models/Reminder");
const { findOwnedPet } = require("./petController");
const { addRewardPoints } = require("../utils/rewardService");
const { sanitizeRecurrence, toLegacyRepeat } = require("../utils/recurrence");
const { isValidObjectId, formatReminder, sendServerError } = require("../utils/helpers");

const COMPLETE_REWARD_POINTS = 10;

async function findOwnedReminder(reminderId, userId) {
    if (!isValidObjectId(reminderId)) {
        return { error: { status: 400, message: "Invalid reminder ID" } };
    }

    const reminder = await Reminder.findById(reminderId).populate("pet", "name");

    if (!reminder) {
        return { error: { status: 404, message: "Reminder not found" } };
    }

    if (String(reminder.owner) !== String(userId)) {
        return { error: { status: 403, message: "You do not have access to this reminder" } };
    }

    return { reminder };
}

async function getReminders(req, res) {
    try {
        const reminders = await Reminder.find({ owner: req.user.id })
            .populate("pet", "name")
            .sort({ date: 1, createdAt: -1 });

        return res.status(200).json(reminders.map(formatReminder));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function createReminder(req, res) {
    try {
        const { pet, title, type, description, date, time, repeat, recurrence } = req.body;

        if (!title || !String(title).trim()) {
            return res.status(400).json({ message: "Reminder title is required" });
        }

        if (!pet) {
            return res.status(400).json({ message: "A reminder must belong to a pet" });
        }

        const petResult = await findOwnedPet(pet, req.user.id);
        if (petResult.error) {
            return res.status(petResult.error.status).json({ message: petResult.error.message });
        }

        const normalizedRecurrence = sanitizeRecurrence(recurrence, repeat);
        const reminder = await Reminder.create({
            owner: req.user.id,
            pet: petResult.pet._id,
            title: String(title).trim(),
            type,
            description,
            date: date || undefined,
            time,
            repeat: toLegacyRepeat(normalizedRecurrence),
            recurrence: normalizedRecurrence
        });

        const populatedReminder = await reminder.populate("pet", "name");
        return res.status(201).json(formatReminder(populatedReminder));
    } catch (error) {
        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return sendServerError(res, error);
    }
}

async function getReminderById(req, res) {
    try {
        const result = await findOwnedReminder(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        return res.status(200).json(formatReminder(result.reminder));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function updateReminder(req, res) {
    try {
        const result = await findOwnedReminder(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        const reminder = result.reminder;
        const { pet, title, type, description, date, time, repeat, recurrence, completed } = req.body;

        if (title !== undefined) {
            if (!title || !String(title).trim()) {
                return res.status(400).json({ message: "Reminder title is required" });
            }
            reminder.title = String(title).trim();
        }

        if (pet !== undefined) {
            const petResult = await findOwnedPet(pet, req.user.id);
            if (petResult.error) {
                return res.status(petResult.error.status).json({ message: petResult.error.message });
            }
            reminder.pet = petResult.pet._id;
        }

        if (type !== undefined) reminder.type = type;
        if (description !== undefined) reminder.description = description;
        if (date !== undefined) reminder.date = date || undefined;
        if (time !== undefined) reminder.time = time;
        if (recurrence !== undefined || repeat !== undefined) {
            const normalizedRecurrence = sanitizeRecurrence(
                recurrence !== undefined ? recurrence : reminder.recurrence,
                repeat !== undefined ? repeat : reminder.repeat
            );
            reminder.recurrence = normalizedRecurrence;
            reminder.repeat = toLegacyRepeat(normalizedRecurrence);
        }
        if (completed !== undefined) reminder.completed = completed;

        const updatedReminder = await reminder.save();
        const populatedReminder = await updatedReminder.populate("pet", "name");
        return res.status(200).json(formatReminder(populatedReminder));
    } catch (error) {
        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return sendServerError(res, error);
    }
}

async function deleteReminder(req, res) {
    try {
        const result = await findOwnedReminder(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        await result.reminder.deleteOne();
        return res.status(200).json({ message: "Reminder deleted" });
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function getRemindersByPet(req, res) {
    try {
        const petResult = await findOwnedPet(req.params.petId, req.user.id);

        if (petResult.error) {
            return res.status(petResult.error.status).json({ message: petResult.error.message });
        }

        const reminders = await Reminder.find({
            owner: req.user.id,
            pet: petResult.pet._id
        })
            .populate("pet", "name")
            .sort({ date: 1, createdAt: -1 });

        return res.status(200).json(reminders.map(formatReminder));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function completeReminder(req, res) {
    try {
        const result = await findOwnedReminder(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        const reminder = result.reminder;

        if (reminder.completed) {
            return res.status(200).json(formatReminder(reminder));
        }

        reminder.completed = true;

        if (!reminder.pointsAwarded) {
            const petName = reminder.pet && reminder.pet.name ? reminder.pet.name : "your pet";
            await addRewardPoints(
                req.user.id,
                COMPLETE_REWARD_POINTS,
                `Completed "${reminder.title}" for ${petName}`
            );
            reminder.pointsAwarded = true;
        }

        const updatedReminder = await reminder.save();
        const populatedReminder = await updatedReminder.populate("pet", "name");
        return res.status(200).json(formatReminder(populatedReminder));
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    getReminders,
    createReminder,
    getReminderById,
    updateReminder,
    deleteReminder,
    getRemindersByPet,
    completeReminder
};
