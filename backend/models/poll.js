const mongoose = require('mongoose');
const crypto = require('crypto');

const Schema = mongoose.Schema;

const responseSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answer: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now, required: true }
});

const pollSchema = new Schema({
    question: { type: String, required: true },
    options: [{ type: String, default: [] }],
    correct_option: { type: Number, default: -1 },
    available: { type: Boolean, default: false, required: true },
    date_created: { type: Date, default: Date.now, required: true },
    created_by: {type: Schema.Types.ObjectId, ref: "User", required: true},
    responses: { type: [responseSchema], default: [] },
    shortId: { type: String, unique: true }
});

pollSchema.index({ shortId: 1 }, { unique: true, sparse: true });

// Pre-save hook to generate shortId
pollSchema.pre('save', async function(next) {
    if (this.available && !this.shortId) {
        try {
            this.shortId = await generateUniqueShortId();
        } catch (error) {
            next(error);
            return; 
        }
    } else if (!this.available) {
        this.shortId = undefined;
    }
    next();
});

async function generateUniqueShortId() {
    let id, existing;
    do {
        id = generateShortId();
        existing = await Poll.findOne({ shortId: id }).exec();
    } while (existing); // If the ID exists, loop to generate a new one
    return id;
}

function generateShortId(length = 6) {
    const characters = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const charactersLength = characters.length;
    const bytes = crypto.randomBytes(length);
    let id = '';

    for (let i = 0; i < length; i++) {
        id += characters[bytes[i] % charactersLength];
    }

    return id;
}

const Poll = mongoose.model('Poll', pollSchema);

module.exports = Poll;