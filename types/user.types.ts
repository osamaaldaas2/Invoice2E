export type UserProfile = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    addressStreet: string | null;
    addressPostalCode: string | null;
    addressCity: string | null;
    addressCountry: string | null;
    phone: string | null;
    taxId: string | null;
    language: 'en' | 'de';
    createdAt: Date;
    updatedAt: Date;
};

export type UpdateProfileRequest = {
    firstName?: string;
    lastName?: string;
    addressStreet?: string;
    addressPostalCode?: string;
    addressCity?: string;
    addressCountry?: string;
    phone?: string;
    taxId?: string;
    language?: 'en' | 'de';
};
