/**
 * AudioAnalyzer class for analyzing audio to detect pauses and silent sections
 * This class works with the Web Audio API to analyze audio data and identify
 * natural pauses in speech for more realistic lip sync animations.
 */
export class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.buffer = null;
        this.pauses = [];
        this.config = {
            // Threshold below which we consider the audio to be silent (0-1)
            silenceThreshold: 0.015,
            // Minimum duration of silence to be considered a pause (ms)
            minPauseDuration: 150,
            // Classification thresholds for pause types (ms)
            shortPauseThreshold: 250,  // Pauses shorter than this are PAUSE_SHORT
            mediumPauseThreshold: 500, // Pauses shorter than this are PAUSE_MED, longer are PAUSE_LONG
            // Whether to log detailed debug information
            debug: false
        };
        this.initAudioContext();
    }

    /**
     * Initialize Web Audio API context
     */
    initAudioContext() {
        try {
            // Use AudioContext or webkitAudioContext for older browsers
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            console.log('Audio context initialized');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
        }
    }

    /**
     * Analyze an audio buffer to detect pauses
     * @param {AudioBuffer|ArrayBuffer} audioData - The audio data to analyze
     * @returns {Promise<Array>} - Array of detected pauses with start time, end time, and duration
     */
    async analyzeAudio(audioData) {
        if (!this.audioContext) {
            throw new Error('Audio context not initialized');
        }

        let buffer;
        if (audioData instanceof AudioBuffer) {
            buffer = audioData;
        } else {
            // Decode the audio data into an AudioBuffer
            try {
                buffer = await this.audioContext.decodeAudioData(audioData);
            } catch (error) {
                console.error('Failed to decode audio data:', error);
                throw error;
            }
        }

        // Store the buffer for later reference
        this.buffer = buffer;

        // Analyze the buffer to detect pauses
        this.pauses = this.detectPauses(buffer);
        
        if (this.config.debug) {
            console.log(`Detected ${this.pauses.length} pauses in audio:`, this.pauses);
        }
        
        return this.pauses;
    }

    /**
     * Analyze audio from a URL
     * @param {string} url - The URL of the audio file to analyze
     * @returns {Promise<Array>} - Array of detected pauses
     */
    async analyzeFromUrl(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return this.analyzeAudio(arrayBuffer);
        } catch (error) {
            console.error('Failed to fetch or analyze audio from URL:', error);
            throw error;
        }
    }

    /**
     * Analyze audio from a blob object
     * @param {Blob} blob - The audio blob to analyze
     * @returns {Promise<Array>} - Array of detected pauses
     */
    async analyzeFromBlob(blob) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            return this.analyzeAudio(arrayBuffer);
        } catch (error) {
            console.error('Failed to analyze audio from blob:', error);
            throw error;
        }
    }

    /**
     * Detect pauses in an audio buffer by analyzing amplitude
     * @param {AudioBuffer} buffer - The audio buffer to analyze
     * @returns {Array} - Array of pauses with start time, end time, and duration
     */
    detectPauses(buffer) {
        // Get the first channel data (mono)
        const channelData = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        
        // Variables to track the current pause
        let inPause = false;
        let pauseStart = 0;
        const pauses = [];
        
        // Calculate window size for analysis (10ms)
        const windowSize = Math.floor(sampleRate * 0.01);
        
        // Process audio in windows
        for (let i = 0; i < channelData.length; i += windowSize) {
            // Calculate RMS amplitude for this window
            let sumSquares = 0;
            const end = Math.min(i + windowSize, channelData.length);
            
            for (let j = i; j < end; j++) {
                sumSquares += channelData[j] * channelData[j];
            }
            
            const rms = Math.sqrt(sumSquares / (end - i));
            const isSilent = rms < this.config.silenceThreshold;
            const timeSeconds = i / sampleRate;
            
            if (isSilent && !inPause) {
                // Start of a pause
                inPause = true;
                pauseStart = timeSeconds;
                
                if (this.config.debug) {
                    console.log(`Pause started at ${pauseStart.toFixed(2)}s (RMS: ${rms.toFixed(4)})`);
                }
            } else if (!isSilent && inPause) {
                // End of a pause
                inPause = false;
                const pauseDuration = (timeSeconds - pauseStart) * 1000; // Convert to ms
                
                // Only record pauses longer than the minimum duration
                if (pauseDuration >= this.config.minPauseDuration) {
                    // Classify the pause type
                    let pauseType;
                    if (pauseDuration < this.config.shortPauseThreshold) {
                        pauseType = 'PAUSE_SHORT';
                    } else if (pauseDuration < this.config.mediumPauseThreshold) {
                        pauseType = 'PAUSE_MED';
                    } else {
                        pauseType = 'PAUSE_LONG';
                    }
                    
                    pauses.push({
                        start: pauseStart,
                        end: timeSeconds,
                        duration: pauseDuration,
                        type: pauseType
                    });
                    
                    if (this.config.debug) {
                        console.log(`Pause ended at ${timeSeconds.toFixed(2)}s, duration: ${pauseDuration.toFixed(0)}ms, type: ${pauseType}`);
                    }
                }
            }
        }
        
        // Check if we ended while still in a pause
        if (inPause) {
            const timeSeconds = channelData.length / sampleRate;
            const pauseDuration = (timeSeconds - pauseStart) * 1000; // Convert to ms
            
            // Only record pauses longer than the minimum duration
            if (pauseDuration >= this.config.minPauseDuration) {
                // Classify the pause type
                let pauseType;
                if (pauseDuration < this.config.shortPauseThreshold) {
                    pauseType = 'PAUSE_SHORT';
                } else if (pauseDuration < this.config.mediumPauseThreshold) {
                    pauseType = 'PAUSE_MED';
                } else {
                    pauseType = 'PAUSE_LONG';
                }
                
                pauses.push({
                    start: pauseStart,
                    end: timeSeconds,
                    duration: pauseDuration,
                    type: pauseType
                });
                
                if (this.config.debug) {
                    console.log(`Final pause ended at ${timeSeconds.toFixed(2)}s, duration: ${pauseDuration.toFixed(0)}ms, type: ${pauseType}`);
                }
            }
        }
        
        return pauses;
    }

    /**
     * Get the pause at a specific time in the audio
     * @param {number} time - The time in seconds
     * @returns {Object|null} - The pause object or null if not in a pause
     */
    getPauseAtTime(time) {
        for (const pause of this.pauses) {
            if (time >= pause.start && time <= pause.end) {
                return pause;
            }
        }
        return null;
    }

    /**
     * Check if a specific time is within a pause
     * @param {number} time - The time in seconds
     * @returns {boolean} - True if the time is within a pause
     */
    isInPause(time) {
        return this.getPauseAtTime(time) !== null;
    }

    /**
     * Set the configuration options for pause detection
     * @param {Object} config - The configuration options
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enable - Whether to enable debug mode
     */
    setDebug(enable) {
        this.config.debug = enable;
    }
}
