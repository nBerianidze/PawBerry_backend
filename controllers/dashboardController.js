const Pet = require("../models/Pet");
const Reminder = require("../models/Reminder");
const { getOrCreateReward } = require("../utils/rewardService");
const { formatReminder, sendServerError } = require("../utils/helpers");

async function getDashboard(req, res) {
    try {
        const userId = req.user.id;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [petCount, upcomingReminders, completedTasks, reward] = await Promise.all([
            Pet.countDocuments({ owner: userId }),
            Reminder.find({
                owner: userId,
                completed: false,
                date: { $gte: startOfToday }
            })
                .populate("pet", "name")
                .sort({ date: 1, time: 1 })
                .limit(10),
            Reminder.countDocuments({ owner: userId, completed: true }),
            getOrCreateReward(userId)
        ]);

        return res.status(200).json({
            petCount,
            upcomingReminders: upcomingReminders.map(formatReminder),
            completedTasks,
            rewardPoints: reward.points
        });
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    getDashboard
};
