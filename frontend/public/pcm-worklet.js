const TARGET_SAMPLE_RATE = 16000;
const CHUNK_BYTES = 3200; // 100 ms of 16 kHz mono 16-bit PCM (1600 samples * 2 bytes)

class Pcm16kProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_SAMPLE_RATE;
    this.inputQueue = [];
    this.readIndex = 0;
    this.outBuffer = new ArrayBuffer(CHUNK_BYTES);
    this.outView = new DataView(this.outBuffer);
    this.outByteOffset = 0;

    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.flushRemaining();
      }
    };
  }

  flushRemaining() {
    if (this.outByteOffset > 0) {
      const partial = this.outBuffer.slice(0, this.outByteOffset);
      this.port.postMessage(partial, [partial]);
      this.outBuffer = new ArrayBuffer(CHUNK_BYTES);
      this.outView = new DataView(this.outBuffer);
      this.outByteOffset = 0;
    }
  }

  writeInt16Sample(floatSample) {
    const clamped = Math.max(-1, Math.min(1, floatSample));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    this.outView.setInt16(this.outByteOffset, int16, true);
    this.outByteOffset += 2;

    if (this.outByteOffset >= CHUNK_BYTES) {
      const completed = this.outBuffer;
      this.port.postMessage(completed, [completed]);
      this.outBuffer = new ArrayBuffer(CHUNK_BYTES);
      this.outView = new DataView(this.outBuffer);
      this.outByteOffset = 0;
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) {
      return true;
    }

    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.inputQueue.push(channel[i]);
    }

    if (this.ratio === 1) {
      while (this.readIndex < this.inputQueue.length) {
        this.writeInt16Sample(this.inputQueue[this.readIndex]);
        this.readIndex += 1;
      }
    } else {
      while (this.readIndex + 1 < this.inputQueue.length) {
        const idx0 = Math.floor(this.readIndex);
        const idx1 = idx0 + 1;
        const frac = this.readIndex - idx0;
        const s0 = this.inputQueue[idx0];
        const s1 = this.inputQueue[idx1];
        const interpolated = s0 + (s1 - s0) * frac;
        this.writeInt16Sample(interpolated);
        this.readIndex += this.ratio;
      }
    }

    const consumed = Math.min(Math.floor(this.readIndex), this.inputQueue.length);
    if (consumed > 0) {
      this.inputQueue.splice(0, consumed);
      this.readIndex -= consumed;
    }

    return true;
  }
}

registerProcessor('pcm-worklet', Pcm16kProcessor);
