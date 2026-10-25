import { TranscriptSegment } from '@/types';

let currentAudioElement: HTMLAudioElement | null = null;

export interface KiviSpeechOptions {
  language?: string;
  voice?: string;
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export type PiperSpeechOptions = KiviSpeechOptions;

/**
 * Plays text aloud using Kivi / Sarvam AI neural voice engine with seamless browser fallback
 */
export async function speakWithKivi(
  text: string,
  options: KiviSpeechOptions = {}
): Promise<void> {
  stopKiviSpeech();

  const { language = 'en', voice = 'priya', speed = 1.0, onStart, onEnd, onError } = options;

  try {
    onStart?.();

    // 1. Call Kivi / Sarvam TTS API endpoint
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text,
        language,
        voice,
        speed,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        currentAudioElement = audio;

        audio.onended = () => {
          currentAudioElement = null;
          onEnd?.();
        };

        audio.onerror = (e) => {
          console.warn('Kivi audio playback error, falling back to speech synthesis:', e);
          fallbackSpeechSynthesis(text, language, onEnd);
        };

        await audio.play();
        return;
      }
    }

    fallbackSpeechSynthesis(text, language, onEnd);
  } catch (err: any) {
    console.warn('Kivi TTS error, using browser speech engine:', err);
    onError?.(err);
    fallbackSpeechSynthesis(text, language, onEnd);
  }
}

export const speakWithPiper = speakWithKivi;

/**
 * Native SpeechSynthesis fallback tuned for Indian & international accents
 */
function fallbackSpeechSynthesis(
  text: string,
  language: string,
  onEnd?: () => void
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  const langTagMap: Record<string, string> = {
    hi: 'hi-IN',
    hinglish: 'hi-IN',
    bn: 'bn-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
    gu: 'gu-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    pa: 'pa-IN',
    ur: 'ur-IN',
    en: 'en-IN',
  };

  utterance.lang = langTagMap[language] || langTagMap[language.toLowerCase()] || 'en-IN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Attempt to select an Indian English or localized voice if available
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find(
    (v) =>
      v.lang.toLowerCase() === utterance.lang.toLowerCase() ||
      v.lang.toLowerCase().startsWith(language.toLowerCase()) ||
      v.name.toLowerCase().includes('india') ||
      v.name.toLowerCase().includes('hindi')
  );

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

/**
 * Stops any active Kivi audio playback
 */
export function stopKiviSpeech(): void {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {}
    currentAudioElement = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export const stopPiperSpeech = stopKiviSpeech;

export interface STTResult {
  transcribedText: string;
  detectedLanguage: string;
  modelUsed: string;
  segments: TranscriptSegment[];
  audioBlob?: Blob;
  audioUrl?: string;
}

/**
 * Encodes PCM samples into a standard 16-bit mono RIFF WAV Blob
 */
function encodeWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // 16 for PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // 1 channel (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate (16-bit mono)
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // PCM data conversion
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Records real microphone audio and transcribes it using Kivi / Sarvam AI Saaras STT API
 */
export class KiviAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private audioChunks: Blob[] = [];

  async start(): Promise<void> {
    this.pcmChunks = [];
    this.audioChunks = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone audio recording is not supported in this browser.');
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 1. AudioContext capturing for pristine 16kHz WAV format (best for Kivi / Sarvam STT)
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.pcmChunks.push(new Float32Array(inputData));
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    } catch (ctxErr) {
      console.warn('AudioContext recording fallback to MediaRecorder:', ctxErr);
    }

    // 2. Standard MediaRecorder as reliable secondary fallback
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };
      this.mediaRecorder.start(250);
    } catch (mrErr) {
      console.warn('MediaRecorder error:', mrErr);
    }
  }

  async stop(language: string = 'en', hintText?: string): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      try {
        // Disconnect audio processors
        if (this.scriptProcessor) {
          try {
            this.scriptProcessor.disconnect();
          } catch {}
          this.scriptProcessor = null;
        }

        const handleAudioFinalization = async () => {
          try {
            let audioBlob: Blob;

            if (this.pcmChunks.length > 0) {
              // Assemble WAV from PCM buffer
              const totalLength = this.pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
              const mergedPcm = new Float32Array(totalLength);
              let offset = 0;
              for (const chunk of this.pcmChunks) {
                mergedPcm.set(chunk, offset);
                offset += chunk.length;
              }
              audioBlob = encodeWavBlob(mergedPcm, 16000);
            } else if (this.audioChunks.length > 0) {
              audioBlob = new Blob(this.audioChunks, {
                type: this.mediaRecorder?.mimeType || 'audio/webm',
              });
            } else {
              audioBlob = new Blob([], { type: 'audio/wav' });
            }

            const audioUrl = URL.createObjectURL(audioBlob);

            // Cleanup stream
            if (this.mediaStream) {
              this.mediaStream.getTracks().forEach((track) => track.stop());
              this.mediaStream = null;
            }
            if (this.audioContext && this.audioContext.state !== 'closed') {
              try {
                await this.audioContext.close();
              } catch {}
              this.audioContext = null;
            }

            // Send to /api/stt
            const formData = new FormData();
            formData.append('audio', audioBlob, 'patient_intake.wav');
            formData.append('language', language);
            if (hintText) formData.append('hintText', hintText);

            const res = await fetch('/api/stt', {
              method: 'POST',
              body: formData,
            });

            if (!res.ok) {
              throw new Error(`Kivi STT API responded with status ${res.status}`);
            }

            const data = await res.json();

            resolve({
              transcribedText: data.transcribedText,
              detectedLanguage: data.detectedLanguage || language,
              modelUsed: data.modelUsed || 'Kivi Voice (Sarvam AI Saaras v4)',
              segments: data.segments || [],
              audioBlob,
              audioUrl,
            });
          } catch (err) {
            reject(err);
          }
        };

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.onstop = () => {
            handleAudioFinalization();
          };
          this.mediaRecorder.stop();
        } else {
          handleAudioFinalization();
        }
      } catch (err) {
        this.cancel();
        reject(err);
      }
    });
  }

  cancel(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.pcmChunks = [];
    this.audioChunks = [];
  }
}

export const WhisperAudioRecorder = KiviAudioRecorder;
