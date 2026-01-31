/**
 * Authentication hook placeholder
 * Will be implemented in Phase 1.3
 */

type AuthState = {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: null;
};

export const useAuth = (): AuthState => {
    // Placeholder implementation
    return {
        isAuthenticated: false,
        isLoading: false,
        user: null,
    };
};
