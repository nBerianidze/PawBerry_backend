const express = require("express");
const {
    getPets,
    createPet,
    getPetById,
    updatePet,
    deletePet
} = require("../controllers/petController");
const { getRemindersByPet } = require("../controllers/reminderController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getPets);
router.post("/", createPet);
router.get("/:petId/reminders", getRemindersByPet);
router.get("/:id", getPetById);
router.put("/:id", updatePet);
router.delete("/:id", deletePet);

module.exports = router;
