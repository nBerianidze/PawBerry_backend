const { getOrCreateReward, addRewardPoints } = require("../utils/rewardService");
const { formatReward, sendServerError } = require("../utils/helpers");

async function getRewards(req, res) {
    try {
        const reward = await getOrCreateReward(req.user.id);
        return res.status(200).json(formatReward(reward));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function addRewards(req, res) {
    try {
        const { points, action } = req.body;

        if (points === undefined || points === null || String(points).trim() === "") {
            return res.status(400).json({ message: "Points are required" });
        }

        const amount = Number(points);

        if (Number.isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: "Points must be a number greater than 0" });
        }

        if (!action || !String(action).trim()) {
            return res.status(400).json({ message: "Action is required" });
        }

        const reward = await addRewardPoints(req.user.id, amount, String(action).trim());
        return res.status(201).json(formatReward(reward));
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    getRewards,
    addRewards
};
