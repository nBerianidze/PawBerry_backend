const mongoose = require("mongoose");
const { fromLegacyRepeat } = require("./recurrence");

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function formatDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().split("T")[0];
}

function formatUser(user) {
    return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phone: user.phone || "",
        dateOfBirth: formatDate(user.dateOfBirth)
    };
}

function formatPet(pet) {
    return {
        id: pet._id,
        owner: pet.owner,
        name: pet.name,
        species: pet.species || "",
        breed: pet.breed || "",
        dateOfBirth: formatDate(pet.dateOfBirth),
        favoriteToy: pet.favoriteToy || "",
        gender: pet.gender || "",
        weight: pet.weight ?? null,
        profileImage: pet.profileImage || "",
        createdAt: pet.createdAt
    };
}

function formatRecurrence(recurrence) {
    if (!recurrence) {
        return null;
    }

    return {
        frequency: recurrence.frequency || "none",
        interval: recurrence.interval || 1,
        unit: recurrence.unit || "day",
        weekDays: Array.isArray(recurrence.weekDays) ? recurrence.weekDays : [],
        monthDay: recurrence.monthDay ?? null,
        ends: recurrence.ends || "never",
        endDate: formatDate(recurrence.endDate)
    };
}

function formatReminder(reminder) {
    const pet = reminder.pet;
    const petId = pet && pet._id ? pet._id : pet;
    let recurrence = formatRecurrence(reminder.recurrence);
    const legacyRepeat = reminder.repeat;
    if (
        (!recurrence || recurrence.frequency === "none") &&
        legacyRepeat &&
        legacyRepeat !== "None"
    ) {
        recurrence = formatRecurrence(fromLegacyRepeat(legacyRepeat));
    }

    return {
        id: reminder._id,
        owner: reminder.owner,
        pet: petId,
        petName: pet && pet.name ? pet.name : undefined,
        title: reminder.title,
        type: reminder.type,
        description: reminder.description || "",
        date: formatDate(reminder.date),
        time: reminder.time || "",
        repeat: reminder.repeat,
        recurrence,
        completed: reminder.completed,
        createdAt: reminder.createdAt
    };
}

function formatReward(reward) {
    return {
        points: reward.points,
        history: (reward.history || []).map((item) => ({
            action: item.action,
            points: item.points,
            date: formatDate(item.date)
        }))
    };
}

function sendServerError(res, error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong on the server" });
}

module.exports = {
    isValidObjectId,
    formatDate,
    formatUser,
    formatPet,
    formatReminder,
    formatReward,
    sendServerError
};
