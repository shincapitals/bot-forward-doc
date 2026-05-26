import { GoogleService } from './services/google.service';
import { config } from './config';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testCalendar() {
    console.log('🔄 Init Google Service...');
    console.log('Creds path:', config.googleCredentials);

    try {
        const googleService = new GoogleService();

        console.log('🔄 Creating test event...');
        const startTime = new Date();
        startTime.setMinutes(startTime.getMinutes() + 5); // 5 mins from now

        const link = await googleService.createCalendarEvent({
            title: 'Test Event from Bot',
            startTime: startTime.toISOString(),
            description: 'This is a test event to verify permissions.'
        });

        console.log('✅ Success! Event created:', link);
    } catch (error: any) {
        console.error('❌ Failed to create event.');
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testCalendar();
