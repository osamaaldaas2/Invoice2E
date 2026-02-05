const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';
const USER_ID = '778af93d-e173-43cc-bf5f-1b0a2be5d933';

async function testCompleteWorkflow() {
    console.log('🚀 Starting Complete Workflow Test...\n');

    try {
        // Step 1: Test Extraction
        console.log('📤 Step 1: Testing Invoice Extraction...');
        const formData = new FormData();
        formData.append('file', fs.createReadStream('test_invoice.pdf'));
        formData.append('userId', USER_ID);

        const extractResponse = await fetch(`${BASE_URL}/api/invoices/extract`, {
            method: 'POST',
            body: formData
        });

        const extractResult = await extractResponse.json();
        console.log('Extract Response Status:', extractResponse.status);
        console.log('Extract Result:', JSON.stringify(extractResult, null, 2));

        if (!extractResponse.ok) {
            throw new Error(`Extraction failed: ${extractResult.error}`);
        }

        const extractionId = extractResult.data.extractionId;
        console.log('✅ Extraction successful! ID:', extractionId);

        // Step 2: Test Review (Create Conversion)
        console.log('\n📝 Step 2: Testing Review Submission...');
        const reviewData = {
            extractionId,
            userId: USER_ID,
            invoiceData: extractResult.data.extractedData,
            accuracy: 95
        };

        const reviewResponse = await fetch(`${BASE_URL}/api/invoices/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reviewData)
        });

        const reviewResult = await reviewResponse.json();
        console.log('Review Response Status:', reviewResponse.status);
        console.log('Review Result:', JSON.stringify(reviewResult, null, 2));

        if (!reviewResponse.ok) {
            throw new Error(`Review failed: ${reviewResult.error}`);
        }

        const conversionId = reviewResult.data.conversionId;
        console.log('✅ Review successful! Conversion ID:', conversionId);

        // Step 3: Test Conversion
        console.log('\n⚙️ Step 3: Testing XRechnung Conversion...');
        const convertData = {
            conversionId,
            userId: USER_ID,
            invoiceData: extractResult.data.extractedData,
            format: 'CII'
        };

        const convertResponse = await fetch(`${BASE_URL}/api/invoices/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(convertData)
        });

        const convertResult = await convertResponse.json();
        console.log('Convert Response Status:', convertResponse.status);
        console.log('Convert Result Keys:', Object.keys(convertResult));

        if (!convertResponse.ok) {
            throw new Error(`Conversion failed: ${convertResult.error}`);
        }

        console.log('✅ Conversion successful!');
        console.log('   - File Name:', convertResult.data.fileName);
        console.log('   - File Size:', convertResult.data.fileSize, 'bytes');
        console.log('   - Validation Status:', convertResult.data.validationStatus);

        // Step 4: Test History
        console.log('\n📜 Step 4: Testing Conversion History...');
        const historyResponse = await fetch(`${BASE_URL}/api/invoices/history?page=1&limit=10`);
        const historyResult = await historyResponse.json();

        console.log('History Response Status:', historyResponse.status);
        console.log('History Items Count:', historyResult.items?.length || 0);

        if (!historyResponse.ok) {
            throw new Error(`History failed: ${historyResult.error}`);
        }

        console.log('✅ History loaded successfully!');

        // Step 5: Test Analytics
        console.log('\n📊 Step 5: Testing Analytics...');
        const analyticsResponse = await fetch(`${BASE_URL}/api/invoices/analytics?type=stats`);
        const analyticsResult = await analyticsResponse.json();

        console.log('Analytics Response Status:', analyticsResponse.status);
        console.log('Analytics Result:', JSON.stringify(analyticsResult, null, 2));

        if (!analyticsResponse.ok) {
            throw new Error(`Analytics failed: ${analyticsResult.error}`);
        }

        console.log('✅ Analytics loaded successfully!');

        console.log('\n\n🎉 ALL TESTS PASSED! The complete workflow is working correctly.');

    } catch (error) {
        console.error('\n\n❌ TEST FAILED:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testCompleteWorkflow();
