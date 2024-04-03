// Imports
require('dotenv').config();
const User = require("../../models/user.js");
const express = require("express");
const bcrypt = require('bcrypt');
const router = express.Router();
const { checkSession } = require('../middleware.js')

router.get('/auth/', async (req, res) => {
    return res.json({
        isLoggedIn: !!req.session.userId,
        username: req.session.username
    });
});

router.post('/login/', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({
            $or: [
                { username: { $regex: `^${identifier}$`, $options: 'i' } },
                { email: { $regex: `^${identifier}$`, $options: 'i' } }
            ]
        });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(400).send('Invalid credentials');
        }
        req.session.userId = user._id; // Create a session
        req.session.username = user.username;
        res.send('Login successful');
    } catch (error) {
        res.status(400).send("Invalid request");
    }
});

// Logout the user by destroying the session
router.get('/logout/', checkSession, async (req, res) => {
    req.session.destroy(function (err) {
        if (err) {
            // Handle error
            console.error("Session destruction error:", err);
            res.status(500).send("Could not log out.");
        } else {
            // Optionally redirect to login page or send a success response
            res.send("Logged out successfully.");
        }
    });
});

// Returns information (excluding password hash) about the user matching email or username
router.get('/lookup/:email_username', async (req, res) => {
    const identifier = req.params.email_username;
    try {
        const existingUser = await User.findOne({
            $or: [
                { username: { $regex: `^${identifier}$`, $options: 'i' } },
                { email: { $regex: `^${identifier}$`, $options: 'i' } }
            ]
        }, { password: 0 });
        if (!existingUser) res.status(404).send("User not found.");
        else res.status(200).send(existingUser);
    }
    catch (error) {
        res.status(500).send("Something went wrong");
    }
});

//Returns information (excluding password hash) about the user matching id
router.get('/:id', async (req, res) => {
    try {
        const existingUser = await User.findById(req.params.id).select('-password');
        if (!existingUser) res.status(404).send("User not found.");
        else res.send(existingUser);
    }
    catch (error) {
        res.status(500).send("Something went wrong");
    }
});

//Creates new user with given information
//@ char restriciton placed on email/username to prevent case where email and username are the same 
//TODO: Password restrictions (minimum strength) 
router.post('/signup/', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Check if email contains '@'
        if (!email.includes('@')) {
            return res.status(400).send('Email must contain an @ symbol.');
        }

        // Check if username contains '@'
        if (username.includes('@')) {
            return res.status(400).send('Username must not contain an @ symbol.');
        }

        const newUser = new User({
            email: email,
            username: username,
            password: password
        });

        await newUser.save();
        res.send("User registration successful.")
    }
    catch (error) {
        if (error.code === 11000) { //Duplicate key error
            if (error.keyPattern.username) {
                console.log('Username already exists.');
                res.status(400).send('Username already exists.');
            } else if (error.keyPattern.email) {
                console.log('Email already exists.');
                res.status(400).send('Email already exists.');
            }
        }
        else if (error.name === 'ValidationError') {
            // Handle validation errors for specific fields
            if (error.errors.username) {
                console.log('Invalid username:', error.errors.username.message);
                res.status(400).send('Invalid username.');
            } else if (error.errors.email) {
                console.log('Invalid email:', error.errors.email.message);
                res.status(400).send('Invalid email.');
            } else {
                // Handle other validation errors
                console.error('Validation error:', error.message);
                res.status(400).send('Invalid input data.');
            }
        } else {
            console.error('Error adding user:', error);
            res.status(400).send('Error adding user.');
        }
    }
});

//Deletes user if authorized (session has same userId), destroys session
router.delete('/:id', checkSession, async (req, res) => {
    try {
        if (req.session.userId != req.params.id) {
            res.status(401).send("Unauthorized");
            return;
        }
        const deletedUser = await User.findOneAndDelete({ _id: req.params.id });
        if (deletedUser) {
            res.send("Deleted user.");
            req.session.destroy(function (err) {
                if (err) {
                    // Handle error
                    console.error("Session destruction error:", err);
                }
            });
        }
        else res.status(404).send("User not found.");
    } catch (error) {
        res.status(400).send("Error");
        console.log("Failed" + error);
    }
});

// TODO: should this be here? want to retrieve all polls a user created from newest to oldest
router.get('/created_polls/:identifier', checkSession, async (req, res) => {
    const identifier = req.params.identifier;
    try {
        const existingUser = await User.findOne({
            $or: [
                { username: identifier },
                { email: identifier }
            ]
        }, { password: 0 })
            .populate('created_poll_id');
        if (!existingUser) {
            return res.status(404).send("User not found.");
        }
        if (existingUser.created_poll_id.length == 0) {
            return res.status(400).send("User has not created any polls.");
        }
        if (existingUser._id != req.session.userId) {
            return res.status(401).send("Unauthorized")
        }
        res.send(existingUser.created_poll_id.reverse());
    }
    catch (error) {
        res.status(500).send({ message: error.message });
    }
})

// Update user password
router.patch("/change_password", checkSession, async (req, res) => {
    const id = req.session.userId
    try {
        const { old_password, new_password } = req.body;
        // Check whether both are valid
        if (!old_password || !new_password) {
            return res.status(400).send('Invalid request');
        }

        // Compare old password with current password in database
        const user = await User.findById(id);
        if (!await bcrypt.compare(old_password, user.password)) {
            return res.status(400).send('Invalid password');
        }

        // password check passes, now update password
        user.password = new_password;
        await user.save();
        res.send('Password updated successfully');
    } 
    catch (error) {
        res.status(400).send("Invalid request");
    }
});


module.exports = router;