const LEGACY_REPEAT = {
    None: { frequency: "none", interval: 1, unit: "day" },
    Daily: { frequency: "daily", interval: 1, unit: "day" },
    Weekly: { frequency: "weekly", interval: 1, unit: "week" },
    "Every 2 weeks": { frequency: "biweekly", interval: 2, unit: "week" },
    Monthly: { frequency: "monthly", interval: 1, unit: "month" },
    Yearly: { frequency: "yearly", interval: 1, unit: "year" },
    Custom: { frequency: "custom", interval: 1, unit: "day" }
};

const UNITS = ["day", "week", "month", "year"];
const FREQUENCIES = ["none", "daily", "weekly", "biweekly", "monthly", "yearly", "custom"];

function fromLegacyRepeat(repeat) {
    const mapped = LEGACY_REPEAT[repeat] || LEGACY_REPEAT.None;
    return {
        frequency: mapped.frequency,
        interval: mapped.interval,
        unit: mapped.unit,
        weekDays: [],
        monthDay: null,
        ends: "never",
        endDate: null
    };
}

function toLegacyRepeat(recurrence) {
    if (!recurrence) {
        return "None";
    }
    switch (recurrence.frequency) {
        case "daily":
            return recurrence.interval === 1 ? "Daily" : "Custom";
        case "weekly":
            return recurrence.interval === 1 ? "Weekly" : "Custom";
        case "biweekly":
            return "Every 2 weeks";
        case "monthly":
            return recurrence.interval === 1 ? "Monthly" : "Custom";
        case "yearly":
            return recurrence.interval === 1 ? "Yearly" : "Custom";
        case "custom":
            return "Custom";
        default:
            return "None";
    }
}

function sanitizeRecurrence(raw, fallbackRepeat) {
    const source = raw && typeof raw === "object" ? raw : fromLegacyRepeat(fallbackRepeat);
    const interval = Math.max(1, Number(source.interval) || 1);
    const unit = UNITS.includes(source.unit) ? source.unit : "day";
    const frequency = FREQUENCIES.includes(source.frequency) ? source.frequency : "none";
    const weekDays = Array.isArray(source.weekDays)
        ? source.weekDays.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6)
        : [];
    const monthDayNumber = Number(source.monthDay);
    const monthDay = Number.isInteger(monthDayNumber) && monthDayNumber >= 1 && monthDayNumber <= 31
        ? monthDayNumber
        : null;
    const ends = source.ends === "on_date" ? "on_date" : "never";
    const endDate = ends === "on_date" && source.endDate ? source.endDate : null;

    return {
        frequency,
        interval,
        unit,
        weekDays,
        monthDay,
        ends,
        endDate
    };
}

module.exports = {
    fromLegacyRepeat,
    toLegacyRepeat,
    sanitizeRecurrence
};
