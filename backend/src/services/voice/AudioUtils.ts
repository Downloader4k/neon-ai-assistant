/**
 * Audio Utilities for Voice Pipeline
 * Handles audio format conversion, WAV encoding/decoding, PCM processing
 */

export interface AudioConfig {
    sampleRate: number;
    channels: number;
    bitDepth: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
    sampleRate: 16000,  // 16kHz - standard for speech recognition
    channels: 1,         // Mono
    bitDepth: 16,        // 16-bit PCM
};

/**
 * Create a WAV header for raw PCM data
 */
export function createWavHeader(dataLength: number, config: AudioConfig = DEFAULT_AUDIO_CONFIG): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = config.sampleRate * config.channels * (config.bitDepth / 8);
    const blockAlign = config.channels * (config.bitDepth / 8);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);           // chunk size
    header.writeUInt16LE(1, 20);            // PCM format
    header.writeUInt16LE(config.channels, 22);
    header.writeUInt32LE(config.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(config.bitDepth, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return header;
}

/**
 * Wrap raw PCM data in a WAV container
 */
export function pcmToWav(pcmData: Buffer, config: AudioConfig = DEFAULT_AUDIO_CONFIG): Buffer {
    const header = createWavHeader(pcmData.length, config);
    return Buffer.concat([header, pcmData]);
}

/**
 * Extract PCM data from a WAV file (skip header)
 */
export function wavToPcm(wavData: Buffer): { pcm: Buffer; config: AudioConfig } {
    // Read WAV header
    const channels = wavData.readUInt16LE(22);
    const sampleRate = wavData.readUInt32LE(24);
    const bitDepth = wavData.readUInt16LE(34);

    // Find data chunk
    let dataOffset = 44; // Standard offset
    if (wavData.toString('ascii', 36, 40) !== 'data') {
        // Non-standard WAV, search for data chunk
        for (let i = 12; i < wavData.length - 8; i++) {
            if (wavData.toString('ascii', i, i + 4) === 'data') {
                dataOffset = i + 8;
                break;
            }
        }
    }

    return {
        pcm: wavData.subarray(dataOffset),
        config: { sampleRate, channels, bitDepth },
    };
}

/**
 * Calculate RMS (Root Mean Square) energy of PCM audio
 * Used for simple Voice Activity Detection
 */
export function calculateRMS(pcmData: Buffer, bitDepth: number = 16): number {
    const samples = bitDepth === 16
        ? pcmData.length / 2
        : pcmData.length;

    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < pcmData.length; i += 2) {
        if (i + 1 < pcmData.length) {
            const sample = pcmData.readInt16LE(i);
            sumSquares += sample * sample;
        }
    }

    return Math.sqrt(sumSquares / samples);
}

/**
 * Simple energy-based Voice Activity Detection
 * Returns true if speech is likely present
 */
export function detectVoiceActivity(
    pcmData: Buffer,
    threshold: number = 500,
    bitDepth: number = 16
): boolean {
    const rms = calculateRMS(pcmData, bitDepth);
    return rms > threshold;
}

/**
 * Resample PCM audio to target sample rate (simple linear interpolation)
 */
export function resamplePCM(
    pcmData: Buffer,
    sourceSampleRate: number,
    targetSampleRate: number
): Buffer {
    if (sourceSampleRate === targetSampleRate) return pcmData;

    const ratio = sourceSampleRate / targetSampleRate;
    const sourceLength = pcmData.length / 2;
    const targetLength = Math.floor(sourceLength / ratio);
    const output = Buffer.alloc(targetLength * 2);

    for (let i = 0; i < targetLength; i++) {
        const sourceIndex = i * ratio;
        const low = Math.floor(sourceIndex);
        const high = Math.min(low + 1, sourceLength - 1);
        const frac = sourceIndex - low;

        const sampleLow = pcmData.readInt16LE(low * 2);
        const sampleHigh = pcmData.readInt16LE(high * 2);
        const interpolated = Math.round(sampleLow + (sampleHigh - sampleLow) * frac);

        output.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    return output;
}

/**
 * Convert Float32 audio data to Int16 PCM
 */
export function float32ToInt16(float32Array: Float32Array): Buffer {
    const int16 = Buffer.alloc(float32Array.length * 2);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, i * 2);
    }
    return int16;
}

/**
 * Convert Int16 PCM to Float32 array
 */
export function int16ToFloat32(int16Buffer: Buffer): Float32Array {
    const float32 = new Float32Array(int16Buffer.length / 2);
    for (let i = 0; i < float32.length; i++) {
        float32[i] = int16Buffer.readInt16LE(i * 2) / 32768.0;
    }
    return float32;
}
