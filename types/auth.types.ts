export type LoginCredentials = {
    email: string;
    password: string;
};

export type SignupCredentials = {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
};

export type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
        id: string;
        email: string;
    };
};

export type TokenPayload = {
    userId: string;
    email: string;
    exp: number;
    iat: number;
};

export type AuthState = {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: {
        id: string;
        email: string;
    } | null;
};
