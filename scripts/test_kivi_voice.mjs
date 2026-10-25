/**
 * Kivi Voice (Sarvam AI) STT & TTS End-to-End Verification Test
 */

const BASE_URL = 'http://localhost:3000';

async function runKiviVoiceTests() {
  console.log('\n======================================================');
  console.log('   KIVI VOICE (SARVAM AI) VERIFICATION SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 2;

  // 1. Text-to-Speech Test
  console.log('▶ TEST 1: Synthesize speech via /api/tts (Kivi Voice)');
  try {
    const ttsRes = await fetch(`${BASE_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        text: 'Patient alert: Immediate clinical review required.',
        language: 'en',
        voice: 'priya',
      }),
    });

    if (!ttsRes.ok) {
      throw new Error(`HTTP ${ttsRes.status}: ${await ttsRes.text()}`);
    }

    const ttsData = await ttsRes.json();
    console.log('  Engine:', ttsData.engine);
    console.log('  Voice:', ttsData.voice);
    console.log('  Duration (sec):', ttsData.audioDurationSeconds);
    console.log('  Audio Data URL length:', ttsData.audioDataUrl?.length);

    if (ttsData.success && ttsData.audioDataUrl && ttsData.engine.includes('Kivi Voice')) {
      console.log('✅ TEST 1 PASSED: Speech synthesis successful\n');
      passed++;
    } else {
      console.log('❌ TEST 1 FAILED: Unexpected response format\n');
    }

    // 2. Speech-to-Text Test using the generated audio
    console.log('▶ TEST 2: Transcribe audio via /api/stt (Kivi Voice Saaras STT)');
    const base64Data = ttsData.audioDataUrl.replace(/^data:audio\/\w+;base64,/, '');
    const audioBuffer = Buffer.from(base64Data, 'base64');

    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'intake.wav');
    form.append('language', 'en');

    const sttRes = await fetch(`${BASE_URL}/api/stt`, {
      method: 'POST',
      body: form,
    });

    if (!sttRes.ok) {
      throw new Error(`HTTP ${sttRes.status}: ${await sttRes.text()}`);
    }

    const sttData = await sttRes.json();
    console.log('  Engine:', sttData.engine);
    console.log('  Model Used:', sttData.modelUsed);
    console.log('  Transcribed Text:', sttData.transcribedText);
    console.log('  Segments:', sttData.segments?.length);

    if (sttData.success && sttData.transcribedText && sttData.engine.includes('Kivi Voice')) {
      console.log('✅ TEST 2 PASSED: Audio transcription successful\n');
      passed++;
    } else {
      console.log('❌ TEST 2 FAILED: Unexpected STT response\n');
    }
  } catch (err) {
    console.error('❌ Error executing Kivi Voice test:', err.message);
  }

  console.log('======================================================');
  console.log(`  RESULT: ${passed}/${total} PASSED`);
  console.log('======================================================\n');
}

runKiviVoiceTests();
