import { GoogleService } from './services/google.service';
import { config } from './config';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Readable } from 'stream';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testDrive() {
    console.log('🔄 Init Google Service...');

    try {
        const googleService = new GoogleService();

        console.log('🔄 Uploading test file...');
        const buffer = Buffer.from('Hello World from Bot', 'utf-8');

        // Try uploading buffer directly (as current code does)
        try {
            // @ts-ignore
            const result = await googleService.uploadFileToDrive('Test_File_Buffer.txt', 'text/plain', buffer);
            console.log('✅ Buffer Upload Success:', result.webViewLink);
        } catch (e: any) {
            console.error('❌ Buffer Upload Failed.');
            // console.error(e); // Service logs it already usually
        }

        // Try using Stream if buffer fails
        console.log('🔄 Testing Stream Upload...');
        const stream = Readable.from(buffer);
        try {
            // @ts-ignore
            const result = await googleService.uploadFileToDrive('Test_File_Stream.txt', 'text/plain', stream);
            console.log('✅ Stream Upload Success:', result.webViewLink);
        } catch (e) {
            console.error('❌ Stream Upload Failed.');
        }

    } catch (error: any) {
        console.error('Global Error:', error);
    }
}

testDrive();
