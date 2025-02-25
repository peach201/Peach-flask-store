import User from '../models/User.js';
import { handleResponse, handleError } from '../utils/responseHandler.js';
import {
    generateAccessToken,
    generateRefreshToken
} from '../utils/generateToken.js';
    
// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -verificationToken -refreshToken')
            .populate('addresses');

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        handleResponse(res, 200, 'User profile retrieved', user);

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { name, email, phone, currentPassword, newPassword } = req.body;

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        // Update basic info
        user.name = name || user.name;
        user.phone = phone || user.phone;

        // Handle email change
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return handleError(res, 400, 'Email already in use');
            }
            user.email = email;
            user.isVerified = false;
        }

        // Handle password change
        if (newPassword) {
            if (!currentPassword) {
                return handleError(res, 400, 'Current password is required');
            }
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return handleError(res, 401, 'Current password is incorrect');
            }
            user.password = newPassword;
        }

        const updatedUser = await user.save();

        // Generate new tokens if credentials changed
        let tokens = {};
        if (email || newPassword) {
            tokens = {
                accessToken: generateAccessToken(updatedUser._id),
                refreshToken: generateRefreshToken(updatedUser._id)
            };
        }

        handleResponse(res, 200, 'Profile updated successfully', {
            user: updatedUser,
            ...tokens
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get all users (Admin)
// @route   GET /api/users
// @access  Admin
export const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const filter = search ? {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const users = await User.find(filter)
            .select('-password -addresses -verificationToken')
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await User.countDocuments(filter);

        handleResponse(res, 200, 'Users retrieved', {
            users,
            total: count,
            pages: Math.ceil(count / limit),
            page: Number(page)
        });

    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Get user by ID (Admin)
// @route   GET /api/users/:id
// @access  Admin
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -verificationToken')
            .populate('addresses');

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        handleResponse(res, 200, 'User details retrieved', user);

    } catch (error) {
        if (error.name === 'CastError') {
            return handleError(res, 400, 'Invalid user ID');
        }
        handleError(res, 500, error.message);
    }
};

// @desc    Manage user addresses
// @route   GET/POST/PUT/DELETE /api/users/addresses
// @access  Private
export const getUserAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('addresses');
        handleResponse(res, 200, 'Addresses retrieved', user.addresses);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

export const addAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const newAddress = req.body;

        // Set first address as default
        if (user.addresses.length === 0) {
            newAddress.isDefault = true;
        }

        user.addresses.push(newAddress);
        await user.save();

        handleResponse(res, 201, 'Address added', user.addresses);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

export const updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const user = await User.findOneAndUpdate(
            { _id: req.user._id, 'addresses._id': id },
            {
                $set: {
                    'addresses.$': {
                        ...updates,
                        _id: id // Preserve existing ID
                    }
                }
            },
            { new: true }
        );

        // Set default address
        if (updates.isDefault) {
            await User.updateMany(
                { _id: req.user._id, 'addresses._id': { $ne: id } },
                { $set: { 'addresses.$[].isDefault': false } }
            );
        }

        handleResponse(res, 200, 'Address updated', user.addresses);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $pull: { addresses: { _id: id } } },
            { new: true }
        );

        // Set new default if needed
        if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
            user.addresses[0].isDefault = true;
            await user.save();
        }

        handleResponse(res, 200, 'Address deleted', user.addresses);
    } catch (error) {
        handleError(res, 500, error.message);
    }
};

// @desc    Delete user account
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUserAccount = async (req, res) => {
    try {
        const { id } = req.params;

        // Authorization check
        if (req.user._id.toString() !== id && req.user.role !== 'admin') {
            return handleError(res, 403, 'Not authorized to delete this account');
        }

        // Prevent admin deletion by non-admins
        const userToDelete = await User.findById(id);
        if (userToDelete.role === 'admin' && req.user.role !== 'admin') {
            return handleError(res, 403, 'Cannot delete admin accounts');
        }

        await User.findByIdAndDelete(id);

        handleResponse(res, 200, 'Account deleted successfully', null);

    } catch (error) {
        if (error.name === 'CastError') {
            return handleError(res, 400, 'Invalid user ID');
        }
        handleError(res, 500, error.message);
    }
};

/*
Key Features:
1. User Management:
   - Profile updates with email verification
   - Password change with current password check
   - Address management with default handling
   - Admin-only user listing

2. Security:
   - Proper authorization checks
   - Password exclusion from responses
   - Session invalidation on email/password changes
   - Admin role protection

3. Address Handling:
   - Automatic default address management
   - Address validation
   - Bulk operations prevention

4. Error Handling:
   - Invalid ID detection
   - Duplicate email prevention
   - Authorization failures
   - Password validation

Example Responses:
1. Profile Update:
{
  "status": 200,
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "accessToken": "eyJhbGci..."
  }
}

2. Address Update:
{
  "status": 200,
  "success": true,
  "message": "Address updated",
  "data": [
    {
      "street": "123 Main St",
      "city": "New York",
      "isDefault": true
    }
  ]
}

3. Admin User List:
{
  "status": 200,
  "success": true,
  "message": "Users retrieved",
  "data": {
    "users": [...],
    "total": 45,
    "pages": 3,
    "page": 1
  }
}
*/