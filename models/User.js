import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter your name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please enter your email'],
        unique: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, 'Please enter a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Please enter a password'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    phone: {
        type: String,
        validate: {
            validator: function (v) {
                return /\d{10}/.test(v);
            },
            message: props => `${props.value} is not a valid phone number!`
        }
    },
    addresses: [{
        street: String,
        city: String,
        postalCode: String,
        country: String,
        isDefault: {
            type: Boolean,
            default: false
        }
    }],
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    refreshToken: String
}, {
    timestamps: true
});

// Password hashing middleware
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);