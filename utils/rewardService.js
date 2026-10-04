const Reward = require("../models/Reward");

async function getOrCreateReward(userId) {
    let reward = await Reward.findOne({ owner: userId });

    if (!reward) {
        reward = await Reward.create({
            owner: userId,
            points: 0,
            history: []
        });
    }

    return reward;
}

async function addRewardPoints(userId, points, action) {
    const reward = await getOrCreateReward(userId);
    const amount = Number(points);

    reward.points += amount;
    reward.history.unshift({
        action,
        points: amount,
        date: new Date()
    });

    await reward.save();
    return reward;
}

module.exports = {
    getOrCreateReward,
    addRewardPoints
};
