import { chunksToBuffer } from "./buffers";

/**
 * Captura del microfono con AudioWorklet: los samples llegan crudos y en el
 * mismo reloj que el transporte, asi la toma se puede alinear con el beat sin
 * adivinar. Si el navegador no deja cargar el worklet, cae a ScriptProcessor.
 */

const WORKLET_SOURCE = `
class TapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (event) => {
      if (event.data === 'start') this.recording = true;
      if (event.data === 'stop') this.recording = false;
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (this.recording && input && input[0]) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('tap-processor', TapProcessor);
`;

export interface RecordedTake {
  buffer: AudioBuffer;
  /** Instante del reloj de audio en el que empezo a entrar señal. */
  startTime: number;
}

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuffer: Float32Array<ArrayBuffer> | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private startTime = 0;
  private pending: Promise<MediaStream> | null = null;

  get armed(): boolean {
    return this.node !== null;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * Lanza la peticion de microfono y devuelve la promesa sin esperarla.
   *
   * Hay que llamarla como PRIMERA instruccion del manejador del toque: Safari
   * concede el microfono mirando si la peticion nace de un gesto del usuario, y
   * cualquier `await` por delante rompe esa cadena. Por eso el permiso se pide
   * aqui y el resto del montaje se hace luego, en `arm`.
   *
   * Los procesados del navegador van apagados: el cancelador de eco, el
   * supresor de ruido y el control de ganancia se comen la dinamica de la voz.
   */
  requestStream(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(
        new DOMException("El navegador no expone el microfono", "NotSupportedError")
      );
    }
    if (!this.pending) {
      this.pending = navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        })
        .catch((error: unknown) => {
          // Un fallo no se cachea: el siguiente toque tiene que volver a pedirlo.
          this.pending = null;
          throw error;
        });
    }
    return this.pending;
  }

  async arm(ctx: AudioContext, destination: AudioNode): Promise<void> {
    if (this.node && this.ctx === ctx) return;
    const stream = await this.requestStream();
    this.dispose();
    this.ctx = ctx;
    this.stream = stream;
    this.pending = null;

    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.meterBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.source.connect(this.analyser);

    // Sumidero mudo: mantiene vivo el grafo sin devolver la voz por los altavoces.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(destination);

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.source.connect(this.monitorGain).connect(destination);

    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const worklet = new AudioWorkletNode(ctx, "tap-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (this.recording) this.chunks.push(event.data);
      };
      this.node = worklet;
    } catch {
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (event) => {
        if (this.recording) this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      this.node = processor;
    }

    this.source.connect(this.node);
    this.node.connect(this.sink);
  }

  setMonitor(enabled: boolean): void {
    if (this.monitorGain) this.monitorGain.gain.value = enabled ? 0.8 : 0;
  }

  /** Nivel de entrada 0..1, para el vumetro. */
  level(): number {
    if (!this.analyser || !this.meterBuffer) return 0;
    this.analyser.getFloatTimeDomainData(this.meterBuffer);
    let sum = 0;
    for (let i = 0; i < this.meterBuffer.length; i++) sum += this.meterBuffer[i] ** 2;
    return Math.min(1, Math.sqrt(sum / this.meterBuffer.length) * 3.2);
  }

  start(): number {
    if (!this.ctx || !this.node) throw new Error("El microfono no esta preparado");
    this.chunks = [];
    this.recording = true;
    this.startTime = this.ctx.currentTime;
    if (this.node instanceof AudioWorkletNode) this.node.port.postMessage("start");
    return this.startTime;
  }

  stop(): RecordedTake | null {
    if (!this.ctx || !this.recording) return null;
    this.recording = false;
    if (this.node instanceof AudioWorkletNode) this.node.port.postMessage("stop");
    const chunks = this.chunks;
    this.chunks = [];
    if (!chunks.length) return null;
    return {
      buffer: chunksToBuffer(this.ctx, chunks, this.ctx.sampleRate),
      startTime: this.startTime,
    };
  }

  dispose(): void {
    this.recording = false;
    this.pending = null;
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.monitorGain?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node = null;
    this.source = null;
    this.sink = null;
    this.monitorGain = null;
    this.analyser = null;
    this.stream = null;
    this.ctx = null;
  }
}

export const recorder = new MicRecorder();
