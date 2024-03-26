// Imports
require('dotenv').config();
const User = require("../../models/user.js");
const express = require("express");
const bcrypt = require('bcrypt');
const router = express.Router();

router.post('/login/', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        console.log(identifier);
        console.log(password);
        const user = await User.findOne({ $or: [{ username : identifier }, { email : identifier}] });
        if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(400).send('Invalid credentials');
        }
        req.session.userId = user._id; // Create a session
        res.send('Login successful');
  } catch (error) {
        res.status(500).send(error.message);
  }}); 

router.get('/logout/', async (req, res) => {
    req.session.destroy(function(err) {
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

router.get('/lookup/:email_username', async (req, res) => {
    const identifier = req.params.email_username;
    try{
        const existingUser = await User.findOne({ $or: [{ username : identifier }, { email : identifier}] }, { password: 0 });
        if(!existingUser) res.status(404).send("User not found.");
        else res.status(200).send(existingUser);
    }
    catch (error) {
        res.status(500).send("Something went wrong");
    }
});

router.get('/:id', async (req, res) => {
    try{
        const existingUser = await User.findById(req.params.id).select('-password');
        if(!existingUser) res.status(404).send("User not found.");
        else res.send(existingUser);
    }
    catch (error) {
        res.status(500).send("Something went wrong");
    }
});

router.post('/signup/', async (req, res) => {
    try{
        const newUser = new User({
            email : req.body.email,
            username : req.body.username,
            password : req.body.password
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
          } else {
            console.error('Error adding user:', error);
            res.status(400).send('Error adding user.');
          }      
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deletedUser = await User.findOneAndDelete({ _id: req.params.id });
        if(deletedUser) res.send("Deleted user.");
        else res.status(404).send("User not found.");
    } catch(error) {   
        res.status(400).send("Error");
        console.log("Failed" + error);
    }     
});

module.exports = router;