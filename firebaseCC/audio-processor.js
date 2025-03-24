const quantumSize = 128 // Number of audio samples processed per render quantum (default size in AudioWorkletNode)

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    // 120 quanta per frame -> 128 samples at 16khz sample rate = 8ms per quanta * 120 = 960ms chunk
    this.quantaPerFrame = 120
    this.quantaCount = 0
    this.frame = new Int16Array(quantumSize * this.quantaPerFrame)
  }

  process(inputs, outputs, parameters) {
    const offset = quantumSize * this.quantaCount
    // Convert 32-bit float number [-1, 1] to 16-bit signed integer [-32768, 32767] (LINEAR16 PCM format)
    inputs[0][0].forEach((sample, idx) => this.frame[offset + idx] = Math.floor(sample * 0x7fff))
    this.quantaCount = this.quantaCount + 1
    if (this.quantaCount === this.quantaPerFrame) {
      this.port.postMessage(this.frame)
      this.quantaCount = 0
    }
    return true
  }
}

registerProcessor('pcm-worker', AudioProcessor)