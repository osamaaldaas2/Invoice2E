// Quick test script for auth API
const testSignup = async () => {
    try {
        const response = await fetch('http://localhost:3000/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'Test123!',
                firstName: 'Test',
                lastName: 'User'
            })
        });
        const data = await response.json();
        console.log('Signup Status:', response.status);
        console.log('Signup Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Signup Error:', error);
    }
};

testSignup();
