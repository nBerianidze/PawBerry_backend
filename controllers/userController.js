const { formatUser, sendServerError } = require("../utils/helpers");

async function getMe(req, res) {
    try {
        return res.status(200).json(formatUser(req.user));
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    getMe
};
