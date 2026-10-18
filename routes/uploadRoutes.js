const express = require("express");
const { uploadImage } = require("../controllers/uploadController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, uploadImage);

module.exports = router;
