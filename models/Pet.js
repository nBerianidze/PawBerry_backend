const mongoose = require("mongoose");

const petSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        name: {
            type: String,
            required: [true, "Pet name is required"],
            trim: true
        },
        species: {
            type: String,
            trim: true,
            default: ""
        },
        breed: {
            type: String,
            required: [true, "Breed is required"],
            trim: true
        },
        dateOfBirth: {
            type: Date
        },
        favoriteToy: {
            type: String,
            trim: true,
            default: ""
        },
        gender: {
            type: String,
            trim: true,
            default: ""
        },
        weight: {
            type: Number
        },
        profileImage: {
            type: String,
            trim: true,
            default: ""
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Pet", petSchema);
