const path = require("path");
const fs = require("fs");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
};

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (req, file, callback) => {
        const extension = ALLOWED_TYPES[file.mimetype] || path.extname(file.originalname).toLowerCase();
        const safeName = `${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e6)}${extension}`;
        callback(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES },
    fileFilter: (_req, file, callback) => {
        if (!ALLOWED_TYPES[file.mimetype]) {
            callback(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
            return;
        }
        callback(null, true);
    }
}).single("image");

function uploadImage(req, res) {
    upload(req, res, (error) => {
        if (error) {
            const message = error.message || "Could not upload the image";
            const status = error.code === "LIMIT_FILE_SIZE" ? 400 : 400;
            return res.status(status).json({
                message: error.code === "LIMIT_FILE_SIZE"
                    ? "Image must be 5 MB or smaller"
                    : message
            });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Please choose an image to upload" });
        }

        return res.status(201).json({
            url: `/uploads/${req.file.filename}`
        });
    });
}

function deleteStoredImage(imagePath) {
    if (!imagePath || typeof imagePath !== "string") {
        return;
    }
    if (!imagePath.startsWith("/uploads/")) {
        return;
    }
    const fileName = path.basename(imagePath);
    const fullPath = path.join(UPLOAD_DIR, fileName);
    if (fs.existsSync(fullPath)) {
        fs.unlink(fullPath, () => {});
    }
}

module.exports = {
    uploadImage,
    deleteStoredImage
};
