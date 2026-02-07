import type { User } from '@/types';
import type { UserProfile, UpdateProfileRequest } from '@/types/user.types';
import { userDbService } from '@/services';

const mapUserToProfile = (user: User): UserProfile => {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        addressStreet: user.addressLine1 ?? null,
        addressPostalCode: user.postalCode ?? null,
        addressCity: user.city ?? null,
        addressCountry: user.country ?? null,
        phone: user.phone ?? null,
        taxId: user.taxId ?? null,
        language: (user.language === 'de' ? 'de' : 'en'),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

export const userService = {
    getProfile: async (userId: string): Promise<UserProfile> => {
        const user = await userDbService.getUserById(userId);
        return mapUserToProfile(user);
    },

    updateProfile: async (
        userId: string,
        data: UpdateProfileRequest
    ): Promise<UserProfile> => {
        const updateData: {
            firstName?: string;
            lastName?: string;
            addressLine1?: string;
            postalCode?: string;
            city?: string;
            country?: string;
            phone?: string;
            taxId?: string;
            language?: string;
        } = {};

        if (data.firstName !== undefined) updateData.firstName = data.firstName;
        if (data.lastName !== undefined) updateData.lastName = data.lastName;
        if (data.addressStreet !== undefined) updateData.addressLine1 = data.addressStreet;
        if (data.addressPostalCode !== undefined) updateData.postalCode = data.addressPostalCode;
        if (data.addressCity !== undefined) updateData.city = data.addressCity;
        if (data.addressCountry !== undefined) updateData.country = data.addressCountry;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.taxId !== undefined) updateData.taxId = data.taxId;
        if (data.language !== undefined) updateData.language = data.language;

        const updated = await userDbService.updateUser(userId, updateData);
        return mapUserToProfile(updated);
    },
};
