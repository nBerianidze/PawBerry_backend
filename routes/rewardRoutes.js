const express = require("express");
const { getRewards, addRewards } = require("../controllers/rewardController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getRewards);
router.post("/add", addRewards);

module.exports = router;
