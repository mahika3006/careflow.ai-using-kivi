import fs from 'fs';
import path from 'path';

// Read API key from .env without printing it
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key && rest.length > 0) {
          process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
}

loadEnv();

const apiKey = process.env.SARVAM_API_KEY || process.env.KIVI_API_KEY;
if (!apiKey) {
  console.error('Error: Neither SARVAM_API_KEY nor KIVI_API_KEY is defined in .env / .env.local');
  process.exit(1);
}

console.log('Testing Sarvam AI / Kivi API connection...');

async function testTts() {
  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: 'CareFlow AI clinical triage system is active and ready.',
      language_code: 'en-IN',
      model: 'bulbul:v3',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`API Call failed with status ${response.status}:`, errText);
    process.exit(1);
  }

  const data = await response.json();
  console.log('API Call Success!');
  console.log('Status: 200 OK');
  console.log('Response keys:', Object.keys(data));
  if (data.audios && data.audios.length > 0) {
    const audioBuffer = Buffer.from(data.audios[0], 'base64');
    const outPath = path.resolve(process.cwd(), 'public', 'test_kivi_speech.wav');
    fs.writeFileSync(outPath, audioBuffer);
    console.log(`Audio successfully generated and saved to: ${outPath} (${audioBuffer.length} bytes)`);
  }
}

testTts().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
