import analyserFrequency from 'analyser-frequency-average';

interface VADOptions {
	fftSize?: number;
	bufferLen?: number;
	smoothingTimeConstant?: number;
	minCaptureFreq?: number;
	maxCaptureFreq?: number;
	noiseCaptureDuration?: number;
	minNoiseLevel?: number;
	maxNoiseLevel?: number;
	avgNoiseMultiplier?: number;
	onVoiceStart?: () => void;
	onVoiceStop?: () => void;
	onUpdate?: (val: number) => void;
}

export default class VAD {
	private audioContext: AudioContext;
	analyser: AnalyserNode;
	private source: AudioNode;
	private destination: AudioNode | undefined;
	private scriptProcessorNode: ScriptProcessorNode;
	private baseLevel = 0;
	private voiceScale = 1;
	private activityCounter = 0;
	private activityCounterMin = 0;
	private activityCounterMax = 30;
	private activityCounterThresh = 5;

	private envFreqRange: number[] = [];
	private isNoiseCapturing = true;
	private prevVadState: boolean | undefined = undefined;
	private vadState = false;
	private captureTimeout: any = null;

	private minCaptureFreq;
	private maxCaptureFreq;
	private minNoiseLevel;
	private maxNoiseLevel;
	private avgNoiseMultiplier;
	private onVoiceStart: () => { };
	private onVoiceStop: () => { };
	private onUpdate: (_: number) => { };

	constructor(audioContext: AudioContext, source: AudioNode, destination: AudioNode | undefined, opts: VADOptions) {
		opts = opts || {};

		var defaults = {
			fftSize: 1024,
			bufferLen: 1024,
			smoothingTimeConstant: 0.2,
			minCaptureFreq: 85,         // in Hz
			maxCaptureFreq: 255,        // in Hz
			noiseCaptureDuration: 1000, // in ms
			minNoiseLevel: 0.3,         // from 0 to 1
			maxNoiseLevel: 0.7,         // from 0 to 1
			avgNoiseMultiplier: 1.2,
			onVoiceStart: () => { },
			onVoiceStop: () => { },
			onUpdate: (_: number) => { }
		};

		var options: any = {};
		for (var key in defaults) {
			options[key] = opts.hasOwnProperty(key) ? (opts as any)[key] : (defaults as any)[key];
		}

		this.audioContext = audioContext;
		this.minCaptureFreq = options.minCaptureFreq;
		this.maxCaptureFreq = options.maxCaptureFreq;
		this.minNoiseLevel = options.minNoiseLevel;
		this.maxNoiseLevel = options.maxNoiseLevel;
		this.avgNoiseMultiplier = options.avgNoiseMultiplier;
		this.onVoiceStart = options.onVoiceStart;
		this.onVoiceStop = options.onVoiceStop;
		this.onUpdate = options.onUpdate;
		this.isNoiseCapturing = options.noiseCaptureDuration > 0;

		this.source = source;
		this.destination = destination;
		this.analyser = audioContext.createAnalyser();
		this.analyser.smoothingTimeConstant = options.smoothingTimeConstant;
		this.analyser.fftSize = options.fftSize;

		this.scriptProcessorNode = audioContext.createScriptProcessor(options.bufferLen, 1, 1);
		this.connect();
		this.scriptProcessorNode.onaudioprocess = e => this.monitor(e);

		if (this.isNoiseCapturing) {
			//console.log('VAD: start noise capturing');
			this.captureTimeout = setTimeout(() => this.init(), options.noiseCaptureDuration);
		}
	}

	init() {
		//console.log('VAD: stop noise capturing');
		this.isNoiseCapturing = false;

		this.envFreqRange = this.envFreqRange.filter(function (val) {
			return val;
		}).sort();
		var averageEnvFreq = this.envFreqRange.length ? this.envFreqRange.reduce(function (p, c) { return Math.min(p, c) }, 1) : this.minNoiseLevel;

		this.baseLevel = averageEnvFreq * this.avgNoiseMultiplier;
		if (this.minNoiseLevel && this.baseLevel < this.minNoiseLevel) this.baseLevel = this.minNoiseLevel;
		if (this.maxNoiseLevel && this.baseLevel > this.maxNoiseLevel) this.baseLevel = this.maxNoiseLevel;

		this.voiceScale = 1 - this.baseLevel;

		//console.log('VAD: base level:', baseLevel);
	}

	send(node: AudioNode) {
		node.connect(this.analyser);
	}

	connect() {
		this.source.connect(this.analyser);
		this.analyser.connect(this.scriptProcessorNode);
		this.scriptProcessorNode.connect(this.destination || this.audioContext.destination);
	}

	disconnect() {
		this.scriptProcessorNode.disconnect();
		this.analyser.disconnect();
		this.source.disconnect();
		if (this.destination) {
			this.destination.disconnect();
			this.source.connect(this.destination);
		}
	}

	destroy() {
		this.captureTimeout && clearTimeout(this.captureTimeout);
		this.disconnect();
		this.scriptProcessorNode.onaudioprocess = null;
	}

	setDestination(destination: AudioNode) {
		if (this.destination) {
			try {
				this.scriptProcessorNode.disconnect(this.destination);
			} catch (ignored) {
				// not connected
			}
		}
		this.destination = destination;
		this.scriptProcessorNode.connect(this.destination);
	}

	monitor(event: AudioProcessingEvent) {
		if (this.destination) {
			for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel++) {
				var inputData = event.inputBuffer.getChannelData(channel);
				var outputData = event.outputBuffer.getChannelData(channel);
				for (var sample = 0; sample < event.inputBuffer.length; sample++) {
					// make output equal to the same as the input
					outputData[sample] = inputData[sample];
				}
			}
		}
		var frequencies = new Uint8Array(this.analyser.frequencyBinCount);
		this.analyser.getByteFrequencyData(frequencies);

		var average = analyserFrequency(this.analyser, frequencies, this.minCaptureFreq, this.maxCaptureFreq);
		if (this.isNoiseCapturing) {
			this.envFreqRange.push(average);
			return;
		}

		if (average >= this.baseLevel && this.activityCounter < this.activityCounterMax) {
			this.activityCounter++;
		} else if (average < this.baseLevel && this.activityCounter > this.activityCounterMin) {
			this.activityCounter--;
		}
		this.vadState = this.activityCounter > this.activityCounterThresh;

		if (this.prevVadState !== this.vadState) {
			this.vadState ? this.onVoiceStart() : this.onVoiceStop();
			this.prevVadState = this.vadState;
		}

		this.onUpdate(Math.max(0, average - this.baseLevel) / this.voiceScale);
	}
}