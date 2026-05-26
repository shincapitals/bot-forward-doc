import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testAI() {
    const logFile = path.resolve(__dirname, '../ai_test.txt');
    const log = (msg: string) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };
    fs.writeFileSync(logFile, 'Starting Vertex-Key API Test...\n');

    const apiKey = process.env.VERTEX_KEY_API_KEY;
    const baseURL = process.env.VERTEX_KEY_BASE_URL || 'https://vertex-key.com/api/v1';
    const model = process.env.AI_MODEL || 'aws/claude-sonnet-4-6';

    if (!apiKey) {
        log('❌ Error: VERTEX_KEY_API_KEY is not defined in .env');
        process.exit(1);
    }
    log('✅ Found API Key: ' + apiKey.slice(0, 8) + '...');
    log(`🔗 Base URL: ${baseURL}`);
    log(`🤖 Model: ${model}`);

    const client = new OpenAI({
        apiKey,
        baseURL,
    });

    log(`\n🔄 Testing model: "${model}"...`);
    try {
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello! Say hi in one sentence.' },
            ],
        });

        const text = completion.choices[0]?.message?.content;
        log(`✅ Success! Model "${model}" works.`);
        log('📝 Response: ' + text);
        log('📊 Usage: ' + JSON.stringify(completion.usage));
    } catch (error: any) {
        log(`❌ Model "${model}" failed.`);
        log('Error Name: ' + error.name);
        log('Error Message: ' + error.message);
        if (error.status) {
            log(`Status: ${error.status}`);
        }
        if (error.error) {
            log('Details: ' + JSON.stringify(error.error));
        }
    }
}

testAI();
