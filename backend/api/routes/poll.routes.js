// Sends some sample data to mongodb server
const mongoose = require('mongoose');
const User = require("../../models/user.js");
const Poll = require("../../models/poll.js")
const express = require("express");
const router = express.Router();
const { checkSession, checkCreateValidPoll } = require('../middleware.js')

//Record a vote from a user. If sucessful, appends _id to  the created_poll_id and answered_poll_id of this user. 
//Also updates the responses of the poll with the request body.
router.patch('/:id/vote', checkSession, async (req, res) => {
    const _id = req.params.id;
    const answer = req.body.answer;
    try {
        if (!mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }
        if(!Number.isInteger(answer)) {
            return res.status(400).json({ message: 'Answer must be an integer.' });
        }

        // Check if the poll is available directly
        const poll = await Poll.findById(_id);
        if (!poll) {
            return res.status(403).json({ message: "Poll does not exist." });
        } else if (!poll.available) {
            return res.status(403).json({ message: "Poll is not accepting responses." });
        }

        // Update user's answered_poll_id without adding duplicates (like adding to a set)
        await User.updateOne(
            { _id: req.session.userId },
            { $addToSet: { answered_poll_id: _id } }
        );

        // Check if user already responded
        let existingResponse = poll.responses.find(r => r.user.toString() === req.session.userId);

        if (existingResponse) {
            // Update the existing response
            existingResponse.answer = answer;
            existingResponse.updatedAt = Date.now();
        } else {
            // Add new response
            poll.responses.push({
                user: req.session.userId,
                answer: answer,
                updatedAt: Date.now()
            });
        }

        const newPoll = await poll.save();
        res.send(newPoll);

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(error => error.message);
            res.status(400).json({ errors: messages });
        } else {
            console.error('Error voting on poll:', error);
            res.status(500).send();
        }
    }
});

//Changes poll availability if requesting user created it.
router.patch('/:id/available', checkSession, async (req, res) => {
    const _id = req.params.id;
    const { available } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }
        if (typeof available !== 'boolean') {
            return res.status(400).json({ message: "'available' must be true or false." });
        }

        const poll = await Poll.findById(_id);
        if (req.session.userId !== poll.created_by.toString()) {
            return res.status(403).send("Forbidden");
        }
        // Update the poll's availability only if it's different
        if (poll.available !== available) {
            poll.available = available;
            const updatedPoll = await poll.save();
            res.send(updatedPoll);
        } else {
            // Do nothing if the current state matches the requested state
            res.json({ message: "No changes made, poll availability is already set to " + available });
        }
    }
    catch (error) {
        console.error('Error changing poll availability:', error);
        res.status(500).send();
    }
})



//Create a new poll with user-specified question and options.
//Adds new poll to User created_poll_id
// Constants

router.post('/', checkSession, checkCreateValidPoll, async (req, res) => {
    // Destructure the required fields from req.body
    const { question, correct_option, options } = req.body;

    try {
        const poll = new Poll({
            question: question,
            correct_option: correct_option,
            options: options,
            created_by: req.session.userId
        });

        const newPoll = await poll.save();

        // Update user's created_poll_id
        await User.updateOne(
            { _id: req.session.userId },
            { $push: { created_poll_id: newPoll._id } }
        );

        res.status(201).json(newPoll);
    }
    catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(error => error.message);
            res.status(400).json({ errors: messages });
        } else {
            console.error('Error creating poll:', error);
            res.status(500).send();
        }
    }
});

//Retrieve the poll by id 
//Removes correct answer, responses in response if not poll creator
router.get('/:id', checkSession, async (req, res) => {
    const _id = req.params.id;
    try {
        let query = {};
        if (_id.length === 6) {
            query.shortId = _id.toUpperCase();
        }
        else {
            if (!mongoose.Types.ObjectId.isValid(_id)) {
                return res.status(400).send({ message: 'Invalid ID format' });
            }
            query._id = _id;
        }
        let poll = await Poll.findOne(query);

        if (!poll) {
            return res.status(404).send({ message: 'Poll not found' });
        }

        // Convert to a JavaScript object to allow modifications
        poll = poll.toObject();

        // Conditionally modify the poll object based on who is requesting
        if (req.session.userId !== poll.created_by.toString()) {
            // If the user is not the creator of the poll, delete the correct answer and filter the responses
            delete poll.correct_option;
            poll.responses = poll.responses.filter(response => response.user.toString() === req.session.userId);
        }

        res.send(poll);
    } catch (error) {
        console.error('Error retrieving poll:', error);
        res.status(500).send();
    }
});

//Delete the poll if user is creator
router.delete('/:id', checkSession, async (req, res) => {
    try {
        const _id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(400).send({ message: 'Invalid ID format' });
        }
        const poll = await Poll.findById(_id).select('created_by');
        if (!poll) {
            return res.status(404).send({ message: "Can't delete poll: Poll not found" });
        }
        if (req.session.userId !== poll.created_by.toString()) {
            return res.status(403).send({ message: "Can't delete poll: Forbidden" });
        }

        // Poll Side
        await Poll.findOneAndDelete({ _id: _id })

        // User side 
        // Each poll is created by ONLY 1 user
        const updateCreated = User.findOneAndUpdate(
            { created_poll_id: _id },
            { $pull: { created_poll_id: _id } }
        );

        // Each poll will be answered by multiple users
        const updateAnswered = User.updateMany(
            { answered_poll_id: _id },
            { $pull: { answered_poll_id: _id } }
        );

        await Promise.all([updateCreated, updateAnswered]);

        res.send({ message: "Poll and references deleted successfully.", poll });

    } catch (error) {
        console.error('Error deleting poll:', error);
        res.status(500).send();
    }
})

router.patch('/:id/clear', checkSession, async (req, res) => {
    try {
        const _id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(400).send({ message: 'Invalid ID format' });
        }
        const poll = await Poll.findById(_id).select('created_by');
        if (!poll) {
            return res.status(404).send({ message: "Can't clear poll: Poll not found" });
        }
        if (req.session.userId !== poll.created_by.toString()) {
            return res.status(403).send({ message: "Can't clear poll: Forbidden." });
        }
        const result = await Poll.updateOne(
            { _id: _id },
            { $set: { responses: [] } }
        );

        // Update User side 
        await User.updateMany(
            { answered_poll_id: _id },
            { $pull: { answered_poll_id: _id } }
        );

        if (result.modifiedCount === 0) {
            return res.status(200).send({ message: 'No updates made to the poll. The poll may be originally empty' });
        }

        res.send({ message: 'Poll responses cleared successfully' });

    } catch (error) {
        console.error('Error clearing poll responses:', error);
        res.status(500).send();
    }
})

module.exports = router;