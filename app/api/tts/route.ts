import { NextRequest, NextResponse } from 'next/server';

// Kivi / Sarvam AI language mapping
export const KIVI_LANG_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  od: 'od-IN',
  hinglish: 'hi-IN',
};


// Available Kivi / Sarvam neural voices for bulbul:v3
export const KIVI_VOICES = [
  'priya',
  'shubh',
  'ishita',
  'kavya',
  'neha',
  'pooja',
  'rohan',
  'simran',
  'amit',
  'dev',
  'aditya',
  'ritu',
];


/**
 * Fallback tone generator in case the network is completely unreachable
 */
function generateFallbackWav(text: string, durationSec: number = 3): Buffer {
  const sampleRate = 22050;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSec);
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const baseFreq = 220;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(2 * Math.PI * 3.5 * t) * 0.5 + 0.5;
    const sample =
      Math.sin(2 * Math.PI * baseFreq * t) * 0.5 +
      Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.3 +
      Math.sin(2 * Math.PI * (baseFreq * 2) * t) * 0.2;
    const value = Math.floor(sample * envelope * 0.3 * 32767);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, value)), 44 + i * 2);
  }

  return buffer;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, language = 'en', voice, speed = 1.0 } = body;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Text parameter is required for speech synthesis' },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.SARVAM_API_KEY ||
      process.env.KIVI_API_KEY;

    if (!apiKey) {
      console.warn('No Kivi/Sarvam API key found, generating local fallback audio');
      const duration = Math.max(2, Math.min(10, Math.ceil(text.split(/\s+/).length * 0.35)));
      const fallbackBuffer = generateFallbackWav(text, duration);
      return NextResponse.json({
        success: true,
        text,
        voice: voice || 'priya',
        engine: 'Kivi Voice (Fallback mode)',
        audioDataUrl: `data:audio/wav;base64,${fallbackBuffer.toString('base64')}`,
      });
    }

    const mappedLang = KIVI_LANG_MAP[language] || KIVI_LANG_MAP[language.toLowerCase()] || 'en-IN';
    const selectedVoice =
      voice && KIVI_VOICES.includes(voice.toLowerCase()) ? voice.toLowerCase() : 'priya';

    // Call Kivi / Sarvam AI TTS endpoint
    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        text: text.trim().slice(0, 2000), // Max allowed by model
        language_code: mappedLang,
        model: 'bulbul:v3',
        speaker: selectedVoice,
        pace: typeof speed === 'number' ? Math.max(0.5, Math.min(2.0, speed)) : 1.0,
        speech_sample_rate: 24000,
        output_audio_codec: 'wav',
      }),
    });

    if (sarvamRes.ok) {
      const data = await sarvamRes.json();
      if (data.audios && data.audios.length > 0) {
        const base64Audio = data.audios[0];
        const wavBuffer = Buffer.from(base64Audio, 'base64');
        const acceptHeader = req.headers.get('accept') || '';

        if (acceptHeader.includes('application/json')) {
          return NextResponse.json({
            success: true,
            text,
            voice: selectedVoice,
            language: mappedLang,
            engine: 'Kivi Voice (Sarvam AI)',
            audioDurationSeconds: Math.ceil(wavBuffer.length / (24000 * 2)),
            audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
          });
        }

        return new NextResponse(new Uint8Array(wavBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-TTS-Engine': 'Kivi Voice (Sarvam AI)',
            'X-Kivi-Voice': selectedVoice,
            'X-Kivi-Language': mappedLang,
            'Content-Length': wavBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    const errorDetails = await sarvamRes.text();
    console.warn(`Kivi / Sarvam TTS API returned status ${sarvamRes.status}:`, errorDetails);

    // Fallback gracefully so clinical UI doesn't freeze
    const duration = Math.max(2, Math.min(10, Math.ceil(text.split(/\s+/).length * 0.35)));
    const fallbackBuffer = generateFallbackWav(text, duration);
    const acceptHeader = req.headers.get('accept') || '';

    if (acceptHeader.includes('application/json')) {
      return NextResponse.json({
        success: true,
        text,
        voice: selectedVoice,
        engine: 'Kivi Voice (Fallback mode)',
        audioDataUrl: `data:audio/wav;base64,${fallbackBuffer.toString('base64')}`,
      });
    }

    return new NextResponse(new Uint8Array(fallbackBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'X-TTS-Engine': 'Kivi Voice Fallback Tone',
      },
    });
  } catch (err: any) {
    console.error('Kivi TTS Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to synthesize speech with Kivi Voice' },
      { status: 500 }
    );
  }
}
