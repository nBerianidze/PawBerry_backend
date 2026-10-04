const express = require("express");
const {
    getReminders,
    createReminder,
    getReminderById,
    updateReminder,
    deleteReminder,
    completeReminder
} = require("../controllers/reminderController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getReminders);
router.post("/", createReminder);
router.patch("/:id/complete", completeReminder);
router.get("/:id", getReminderById);
router.put("/:id", updateReminder);
router.delete("/:id", deleteReminder);

module.exports = router;
