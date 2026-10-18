const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const petRoutes = require("./routes/petRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

connectDB();

app.get("/", (req, res) => {
    res.json({
        message: "PawBerry Backend is running!"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pets", petRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/uploads", uploadRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Invalid JSON in request body" });
    }

    console.error(error);
    return res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`PawBerry server running on port ${PORT}`);
});
