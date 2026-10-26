const Pet = require("../models/Pet");
const Reminder = require("../models/Reminder");
const { deleteStoredImage } = require("./uploadController");
const { isValidObjectId, formatPet, sendServerError } = require("../utils/helpers");

const GENDERS = ["Male", "Female", "Unknown"];

function normalizeGender(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return "";
    }
    const match = GENDERS.find((item) => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
}

async function getPets(req, res) {
    try {
        const pets = await Pet.find({ owner: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json(pets.map(formatPet));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function createPet(req, res) {
    try {
        const { name, species, breed, dateOfBirth, favoriteToy, gender, weight, profileImage } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Pet name is required" });
        }
        if (!species || !String(species).trim()) {
            return res.status(400).json({ message: "Species is required" });
        }
        if (!breed || !String(breed).trim()) {
            return res.status(400).json({ message: "Breed is required" });
        }

        const pet = await Pet.create({
            owner: req.user.id,
            name: name.trim(),
            species: String(species).trim(),
            breed: String(breed).trim(),
            dateOfBirth: dateOfBirth || undefined,
            favoriteToy,
            gender: normalizeGender(gender) || "",
            weight,
            profileImage: profileImage || ""
        });

        return res.status(201).json(formatPet(pet));
    } catch (error) {
        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return sendServerError(res, error);
    }
}

async function findOwnedPet(petId, userId) {
    if (!isValidObjectId(petId)) {
        return { error: { status: 400, message: "Invalid pet ID" } };
    }

    const pet = await Pet.findById(petId);

    if (!pet) {
        return { error: { status: 404, message: "Pet not found" } };
    }

    if (String(pet.owner) !== String(userId)) {
        return { error: { status: 403, message: "You do not have access to this pet" } };
    }

    return { pet };
}

async function getPetById(req, res) {
    try {
        const result = await findOwnedPet(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        return res.status(200).json(formatPet(result.pet));
    } catch (error) {
        return sendServerError(res, error);
    }
}

async function updatePet(req, res) {
    try {
        const result = await findOwnedPet(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        const pet = result.pet;
        const { name, species, breed, dateOfBirth, favoriteToy, gender, weight, profileImage } = req.body;

        if (name !== undefined) {
            if (!name || !String(name).trim()) {
                return res.status(400).json({ message: "Pet name is required" });
            }
            pet.name = String(name).trim();
        }

        if (species !== undefined) {
            if (!species || !String(species).trim()) {
                return res.status(400).json({ message: "Species is required" });
            }
            pet.species = String(species).trim();
        }
        if (breed !== undefined) {
            if (!String(breed).trim()) {
                return res.status(400).json({ message: "Breed is required" });
            }
            pet.breed = String(breed).trim();
        }
        if (dateOfBirth !== undefined) pet.dateOfBirth = dateOfBirth || undefined;
        if (favoriteToy !== undefined) pet.favoriteToy = favoriteToy;
        if (gender !== undefined) pet.gender = normalizeGender(gender) || "";
        if (weight !== undefined) pet.weight = weight;
        if (profileImage !== undefined) pet.profileImage = profileImage || "";

        const updatedPet = await pet.save();
        return res.status(200).json(formatPet(updatedPet));
    } catch (error) {
        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return sendServerError(res, error);
    }
}

async function deletePet(req, res) {
    try {
        const result = await findOwnedPet(req.params.id, req.user.id);

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        await Reminder.deleteMany({ pet: result.pet._id, owner: req.user.id });
        deleteStoredImage(result.pet.profileImage);
        await result.pet.deleteOne();

        return res.status(200).json({ message: "Pet deleted" });
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    getPets,
    createPet,
    getPetById,
    updatePet,
    deletePet,
    findOwnedPet
};
