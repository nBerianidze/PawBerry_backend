const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendServerError } = require("../utils/helpers");
const {
    EmailValidationError,
    assertDomainCanReceiveMail,
    normalizeRegistrationEmail
} = require("../utils/emailValidation");

function createToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });
}

function sendEmailError(res, error) {
    return res.status(error.statusCode).json({
        message: error.message,
        field: "email",
        code: error.code
    });
}

async function register(req, res) {
    try {
        const { firstName, lastName, username, email, phone, dateOfBirth, password } = req.body;

        if (!firstName || !lastName || !username || !email || !password) {
            return res.status(400).json({
                message: "First name, last name, username, email, and password are required"
            });
        }

        let normalizedEmail;
        try {
            normalizedEmail = normalizeRegistrationEmail(email);
        } catch (error) {
            if (error instanceof EmailValidationError) {
                return sendEmailError(res, error);
            }
            throw error;
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const existingUsername = await User.findOne({ username: username.toLowerCase().trim() });
        if (existingUsername) {
            return res.status(400).json({ message: "Username already exists" });
        }

        try {
            await assertDomainCanReceiveMail(normalizedEmail.asciiDomain);
        } catch (error) {
            if (error instanceof EmailValidationError) {
                return sendEmailError(res, error);
            }
            throw error;
        }

        // The User schema stores the whole address in lowercase, so duplicate
        // checks and new accounts use that same form.
        const storedEmail = normalizedEmail.email.toLowerCase();
        const existingEmail = await User.findOne({ email: storedEmail });
        if (existingEmail) {
            return res.status(400).json({
                message: "Email already exists",
                field: "email",
                code: "email_taken"
            });
        }

        const user = await User.create({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            username: username.trim(),
            email: storedEmail,
            phone: phone ? String(phone).trim() : "",
            dateOfBirth: dateOfBirth || undefined,
            password
        });

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                message: "JWT_SECRET is missing in the .env file."
            });
        }

        const token = createToken(user._id);

        return res.status(201).json({
            message: "Registration successful",
            token,
            user: {
                id: user._id,
                username: user.username,
                firstName: user.firstName
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.username) {
                return res.status(400).json({ message: "Username already exists" });
            }
            if (error.keyPattern && error.keyPattern.email) {
                return res.status(400).json({
                    message: "Email already exists",
                    field: "email",
                    code: "email_taken"
                });
            }
            return res.status(400).json({ message: "Username or email already exists" });
        }

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return sendServerError(res, error);
    }
}

async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        const user = await User.findOne({ username: username.toLowerCase().trim() });

        if (!user) {
            return res.status(400).json({ message: "User does not exist" });
        }

        const passwordMatches = await user.matchPassword(password);

        if (!passwordMatches) {
            return res.status(400).json({ message: "Incorrect password" });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                message: "JWT_SECRET is missing in the .env file."
            });
        }

        const token = createToken(user._id);

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                username: user.username,
                firstName: user.firstName
            }
        });
    } catch (error) {
        return sendServerError(res, error);
    }
}

module.exports = {
    register,
    login
};
