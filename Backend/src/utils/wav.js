import { AppError } from '../middleware/errorHandler.js';

export const FFMPEG_CONVERSION_CMD =
  'ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le output.wav';

const EXPECTED_SAMPLE_RATE = 16000;
const EXPECTED_CHANNELS = 1;
const EXPECTED_BITS_PER_SAMPLE = 16;
const PCM_AUDIO_FORMAT = 1;

/**
 * Parses a WAV buffer, validates that it is 16-bit signed PCM, mono, 16 kHz,
 * and returns the stripped raw PCM buffer along with audio metadata.
 */
export function parseAndStripWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new AppError(
      400,
      `Invalid or truncated WAV file. Convert your audio using: ${FFMPEG_CONVERSION_CMD}`
    );
  }

  const riffHeader = buffer.toString('ascii', 0, 4);
  const waveHeader = buffer.toString('ascii', 8, 12);

  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new AppError(
      415,
      `Only WAV files (16-bit PCM, mono, 16 kHz) are supported. Convert your audio using: ${FFMPEG_CONVERSION_CMD}`
    );
  }

  let offset = 12;
  let fmtInfo = null;
  let dataOffset = null;
  let dataSize = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkDataStart + chunkSize > buffer.length) {
      // Allow incomplete RIFF size only if data chunk itself overflows? Reject truncated chunks cleanly.
      if (chunkId === 'data' && chunkDataStart < buffer.length) {
        dataOffset = chunkDataStart;
        dataSize = buffer.length - chunkDataStart;
        break;
      }
      throw new AppError(
        400,
        `Corrupted WAV chunk "${chunkId}". Convert your audio using: ${FFMPEG_CONVERSION_CMD}`
      );
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new AppError(400, `Invalid WAV fmt chunk. Convert using: ${FFMPEG_CONVERSION_CMD}`);
      }
      fmtInfo = {
        audioFormat: buffer.readUInt16LE(chunkDataStart),
        numChannels: buffer.readUInt16LE(chunkDataStart + 2),
        sampleRate: buffer.readUInt32LE(chunkDataStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkDataStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
      break;
    }

    // RIFF chunks are word-aligned (padded to even byte boundary)
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!fmtInfo) {
    throw new AppError(
      400,
      `Missing WAV format metadata (fmt chunk). Convert your audio using: ${FFMPEG_CONVERSION_CMD}`
    );
  }

  if (
    fmtInfo.audioFormat !== PCM_AUDIO_FORMAT ||
    fmtInfo.numChannels !== EXPECTED_CHANNELS ||
    fmtInfo.sampleRate !== EXPECTED_SAMPLE_RATE ||
    fmtInfo.bitsPerSample !== EXPECTED_BITS_PER_SAMPLE
  ) {
    throw new AppError(
      415,
      `Unsupported WAV format (got format=${fmtInfo.audioFormat}, channels=${fmtInfo.numChannels}, sampleRate=${fmtInfo.sampleRate}Hz, bits=${fmtInfo.bitsPerSample}). Required: 16-bit PCM (format=1), mono (1 channel), 16000 Hz. Convert using: ${FFMPEG_CONVERSION_CMD}`
    );
  }

  if (dataOffset === null || !dataSize || dataSize <= 0) {
    throw new AppError(400, 'WAV file contains no audio data.');
  }

  const pcmBuffer = buffer.subarray(dataOffset, dataOffset + dataSize);
  const bytesPerSecond = EXPECTED_SAMPLE_RATE * EXPECTED_CHANNELS * (EXPECTED_BITS_PER_SAMPLE / 8);
  const durationSec = Math.max(1, Math.round(pcmBuffer.length / bytesPerSecond));

  return {
    pcmBuffer,
    sampleRate: fmtInfo.sampleRate,
    numChannels: fmtInfo.numChannels,
    bitsPerSample: fmtInfo.bitsPerSample,
    durationSec,
  };
}
