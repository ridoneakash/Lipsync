import { BlendShapeMapper } from '../BlendShapeMapper.js';
import { AudioAnalyzer } from './AudioAnalyzer.js';

export class LipSyncController {
    constructor(blendShapeControls, emotionController) {
        this.blendShapeControls = blendShapeControls;
        this.blendShapeMapper = new BlendShapeMapper();
        this.emotionController = emotionController; // Add emotionController reference
        this.isAnimating = false;
        this.currentTone = 'neutral';
        this.initializeAudioContext();

        // Initialize the audio analyzer for detecting pauses in speech
        this.audioAnalyzer = new AudioAnalyzer();
        this.usingAudioBasedPauses = false;  // Flag to track whether we're using audio-based pause detection
        this.currentAudio = null;           // Current audio element being played
        this.pauseUpdateInterval = null;    // Interval for checking audio position against detected pauses
        this.detectedPauses = [];           // Array of detected pauses in the current audio
        this.lastAppliedPauseId = null;     // ID of the last pause that was applied
        this.currentlyInPause = false;      // Whether we're currently in a pause

        // Timing configuration for lip sync
        this.phonemeOffsetMs = 50;     // Initial delay before starting lip movement
        this.transitionDuration = 105; // Duration for blend shape transitions in ms
        this.phonemeSpeedMs = 135;    // Default time between phonemes in ms (matching normal speech rate)
        this.endDelayMs = 550;         // Delay before stopping animation after last phoneme
        this.lastPhonemeTime = 0;      // Track when the last phoneme will be processed

        // Speech speed settings
        this.speechRate = {
            slow: 155,    // ms between phonemes for slow speech (longer time between phonemes)
            normal: 135,  // ms between phonemes for normal speech
            fast: 115,     // ms between phonemes for fast speech (shorter time between phonemes)
        };

        // Anticipation settings for lip sync
        this.anticipation = {
            enabled: false,           // Whether anticipation is enabled
            factor: 0.35,             // How much to blend with the next phoneme (0-1)
            offsetFactor: 0.6,       // When to start anticipating the next phoneme (0-1, relative to phonemeSpeedMs)
        };

        this.emotionIntensityRange = {
            min: 0.7,  // Minimum intensity during speech
            max: 1.0   // Maximum intensity during speech
        };

        // Phoneme-specific duration multipliers
        this.phonemeDurations = {
            // Vowels (longer durations)
            'AAA': 1.3,  // Multiplier for base duration
            'EH': 1.2,
            'AHH': 1.2,
            'IEE': 1.2,
            'OHH': 1.3,
            'UUU': 1.2,

            // Consonants (shorter durations)
            'SSS': 0.9,
            'FFF': 0.8,
            'TTH': 0.75,
            'MBP': 0.8,
            'RRR': 0.9,
            'WWW': 0.9,
            'SSH': 0.9,
            //'SCHWA': 1.0,  // Default/neutral sound

            // Pauses (different durations for natural speech rhythm)
            'PAUSE_SHORT': 2.0,  
            'PAUSE_MED': 3.0,   
            'PAUSE_LONG': 4.5   
        };

        // Initialize with empty blend shapes
        this.currentBlendShapes = new Map();
        this.targetBlendShapes = new Map();

        // Initialize blend shapes after setup
        this.initializeBlendShapes();

        // API endpoint for phonetic analysis
        this.phoneticAnalysisEndpoint = '/api/phonetic-analysis';

        // Cache for phonetic analysis results
        this.phoneticCache = new Map();

        // Setup UI controls if debug panel exists
        this.setupUI();
    }

    initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            console.log('Audio context initialized successfully');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            this.audioAvailable = false;
        }
    }

    initializeBlendShapes() {
        // Get available blend shapes from controls
        const availableBlendShapes = Object.keys(this.blendShapeControls);
        console.log('Available blend shapes:', availableBlendShapes);

        // Initialize all non-emotion blend shapes to their default values
        Object.entries(this.blendShapeControls).forEach(([name, control]) => {
            if (control && control.mesh && typeof control.index === 'number' &&
                !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                this.currentBlendShapes.set(name, 0);
                this.targetBlendShapes.set(name, 0);
                control.mesh.morphTargetInfluences[control.index] = 0;
                control.value = 0;
            }
        });
    }

    setTone(tone) {
        if (['happy', 'sad', 'angry', 'surprise', 'fear', 'neutral'].includes(tone)) {
            this.currentTone = tone;
            console.log('Set lip sync tone to:', tone);
        }
    }

    /**
     * Configure anticipation settings for lip sync
     * @param {Object} settings - Settings to update
     * @param {Boolean} settings.enabled - Enable/disable anticipation
     * @param {Number} settings.factor - Blend factor between phonemes (0-1)
     * @param {Number} settings.offsetFactor - When to start anticipating (0-1, relative to phonemeSpeedMs)
     */
    setAnticipation(settings = {}) {
        if (typeof settings.enabled === 'boolean') {
            this.anticipation.enabled = settings.enabled;
        }

        if (typeof settings.factor === 'number') {
            this.anticipation.factor = Math.max(0, Math.min(1, settings.factor));
        }

        if (typeof settings.offsetFactor === 'number') {
            this.anticipation.offsetFactor = Math.max(0, Math.min(1, settings.offsetFactor));
        }

        console.log('Updated lip sync anticipation settings:', this.anticipation);
    }

    async speak(text, speed = 'normal') {
        if (!text) {
            console.warn('No text provided for speech');
            return;
        }

        if (this.isAnimating) {
            this.stopAnimation();
        }

        // Set the phoneme speed based on the speech rate
        this.phonemeSpeedMs = this.speechRate[speed] || this.speechRate.normal;
        console.log(`Speaking with ${speed} speed (${this.phonemeSpeedMs}ms between phonemes)`);

        // Prepare phoneme data first, but don't start animation yet
        try {
            // Get phonemes using the server-side analysis and prepare them
            const phonemes = await this.getPhonemes(text);

            // Store phoneme data for synchronized start
            this.preparedPhonemes = {
                phonemes,
                anticipationEnabled: this.anticipation.enabled,
                anticipationFactor: this.anticipation.factor,
                anticipationOffset: this.phonemeSpeedMs * this.anticipation.offsetFactor
            };

            console.log(`Prepared ${phonemes.length} phonemes for synchronized speak animation`);
        } catch (error) {
            console.error('Error processing speech with phonetic analysis, falling back to character-based:', error);
            // Fall back to character-based method preparation
            this.preparePhonemes(text);
        }

        // Start the animation with prepared phonemes
        this.isAnimating = true;
        this.lastPhonemeTime = 0; // Reset last phoneme time

        // Start the animation with the prepared phonemes
        const duration = this.startPreparedAnimation();
        console.log('Started speaking animation for text:', text);

        // Return the estimated duration of the lip sync animation
        return duration;
    }

    async getPhonemes(text) {
        // Check if we have a cached result
        if (this.phoneticCache.has(text)) {
            console.log('Using cached phonetic analysis for:', text);
            return this.phoneticCache.get(text);
        }

        try {
            console.log('Requesting phonetic analysis for:', text);
            const response = await fetch(this.phoneticAnalysisEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                throw new Error(`Phonetic analysis request failed with status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status !== 'success') {
                throw new Error(`Phonetic analysis error: ${data.error || 'Unknown error'}`);
            }

            // Cache the results for future use
            this.phoneticCache.set(text, data.phonemes.sequence);

            console.log('Received phonetic analysis:', data.phonemes.sequence);
            return data.phonemes.sequence;
        } catch (error) {
            console.error('Error fetching phonetic analysis:', error);
            throw error;
        }
    }

    async processPhonemes(phonemes) {
        let currentTime = this.phonemeOffsetMs; // Start with initial offset

        // Use anticipation settings from configuration
        const anticipationEnabled = this.anticipation.enabled;
        const anticipationFactor = this.anticipation.factor;
        const anticipationOffset = this.phonemeSpeedMs * this.anticipation.offsetFactor;

        // Process each phoneme and schedule its application
        for (let i = 0; i < phonemes.length; i++) {
            const currentPhoneme = phonemes[i];
            const nextPhoneme = i < phonemes.length - 1 ? phonemes[i + 1] : null;

            // Schedule the phoneme application
            setTimeout(() => {
                this.applyPhoneme(currentPhoneme);
            }, currentTime);

            // If anticipation is enabled and we have a next phoneme, schedule anticipation
            if (anticipationEnabled && nextPhoneme) {
                setTimeout(() => {
                    this.applyAnticipatedPhoneme(currentPhoneme, nextPhoneme, anticipationFactor);
                }, currentTime + anticipationOffset);
            }

            // Apply phoneme-specific duration
            const durationMultiplier = this.phonemeDurations[currentPhoneme] || 1.0;
            const phonemeDuration = this.phonemeSpeedMs * durationMultiplier;

            // Update time for next phoneme
            currentTime += phonemeDuration;

            // Update last phoneme time to track when animation should end
            this.lastPhonemeTime = currentTime;

            // Log phoneme duration for debugging
            if (i === 0 || i === phonemes.length - 1 || i % 10 === 0) {
                console.log(`Phoneme ${currentPhoneme} duration: ${phonemeDuration}ms (multiplier: ${durationMultiplier})`);
            }
        }

        const syncMode = anticipationEnabled ? "with anticipation" : "without anticipation";
        console.log(`Lip sync animation scheduled for approximately ${this.lastPhonemeTime + this.endDelayMs}ms ${syncMode}`);
    }

    // Storage for prepared phonemes (used for synchronization)
    preparedPhonemes = null;

    /**
     * Prepare phoneme data for animation without starting the animation yet
     * This is part of the improved synchronization system
     * @param {string} text - The text to process for lip sync
     * @returns {Object} - Object containing prepared phoneme data
     */
    preparePhonemes(text) {
        if (!text) {
            console.warn('No text provided for phoneme preparation');
            return null;
        }

        const chars = [...text.toUpperCase()];
        let i = 0;
        let phonemes = []; // Store all phonemes

        // Extract all phonemes from text
        while (i < chars.length) {
            const phoneme = this.getPhonemeFromChar(chars[i], i < chars.length - 1 ? chars[i + 1] : null);
            const skipNext = phoneme === 'TTH';

            phonemes.push(phoneme);
            i += skipNext ? 2 : 1;
        }

        // Store the prepared phonemes for later use
        this.preparedPhonemes = {
            phonemes,
            anticipationEnabled: this.anticipation.enabled,
            anticipationFactor: this.anticipation.factor,
            anticipationOffset: this.phonemeSpeedMs * this.anticipation.offsetFactor
        };

        console.log(`Prepared ${phonemes.length} phonemes for synchronized animation`);
        return this.preparedPhonemes;
    }

    /**
     * Start the animation with previously prepared phonemes
     * Called exactly when audio playback begins to ensure perfect synchronization
     * @returns {number} - Estimated duration of the animation in milliseconds
     */
    startPreparedAnimation() {
        if (!this.preparedPhonemes) {
            console.warn('No prepared phonemes available to start animation');
            return 0;
        }

        const { phonemes, anticipationEnabled, anticipationFactor, anticipationOffset } = this.preparedPhonemes;

        if (this.isAnimating) {
            this.stopAnimation();
        }

        this.isAnimating = true;
        this.lastPhonemeTime = 0; // Reset last phoneme time

        let currentTime = this.phonemeOffsetMs; // Start with initial offset

        // Process the prepared phonemes
        for (let i = 0; i < phonemes.length; i++) {
            const currentPhoneme = phonemes[i];
            const nextPhoneme = i < phonemes.length - 1 ? phonemes[i + 1] : null;

            // Schedule the phoneme application
            setTimeout(() => {
                this.applyPhoneme(currentPhoneme);
            }, currentTime);

            // If anticipation is enabled and we have a next phoneme, schedule anticipation
            if (anticipationEnabled && nextPhoneme) {
                setTimeout(() => {
                    this.applyAnticipatedPhoneme(currentPhoneme, nextPhoneme, anticipationFactor);
                }, currentTime + anticipationOffset);
            }

            // Apply phoneme-specific duration
            const durationMultiplier = this.phonemeDurations[currentPhoneme] || 1.0;
            const phonemeDuration = this.phonemeSpeedMs * durationMultiplier;

            // Update time for next phoneme
            currentTime += phonemeDuration;

            // Update last phoneme time to track when animation should end
            this.lastPhonemeTime = currentTime;

            // Log phoneme duration for debugging (only for a few phonemes to avoid console spam)
            if (i === 0 || i === phonemes.length - 1 || i % 10 === 0) {
                console.log(`Synchronized phoneme ${currentPhoneme} duration: ${phonemeDuration}ms (multiplier: ${durationMultiplier})`);
            }
        }

        const syncMode = anticipationEnabled ? "with anticipation" : "without anticipation";
        console.log(`Synchronized lip sync animation started with ${phonemes.length} phonemes, duration: ~${this.lastPhonemeTime + this.endDelayMs}ms ${syncMode}`);

        // Clear the prepared phonemes after starting
        this.preparedPhonemes = null;

        this.animate(); // Start the animation loop

        // Return the estimated duration
        return this.lastPhonemeTime + this.endDelayMs;
    }

    // Character-based method as fallback - with configurable anticipation
    processWordCharacterBased(text) {
        const chars = [...text.toUpperCase()];
        let i = 0;
        let currentTime = this.phonemeOffsetMs; // Start with initial offset
        let phonemes = []; // Store all phonemes first

        // Use anticipation settings from configuration
        const anticipationEnabled = this.anticipation.enabled;
        const anticipationFactor = this.anticipation.factor;
        const anticipationOffset = this.phonemeSpeedMs * this.anticipation.offsetFactor;

        // First, extract all phonemes from text
        while (i < chars.length) {
            const phoneme = this.getPhonemeFromChar(chars[i], i < chars.length - 1 ? chars[i + 1] : null);
            const skipNext = phoneme === 'TTH';

            phonemes.push(phoneme);
            i += skipNext ? 2 : 1;
        }

        // Now process phonemes with anticipation if enabled
        for (let i = 0; i < phonemes.length; i++) {
            const currentPhoneme = phonemes[i];
            const nextPhoneme = i < phonemes.length - 1 ? phonemes[i + 1] : null;

            // Schedule the phoneme application
            setTimeout(() => {
                this.applyPhoneme(currentPhoneme);
            }, currentTime);

            // If anticipation is enabled and we have a next phoneme, schedule anticipation
            if (anticipationEnabled && nextPhoneme) {
                setTimeout(() => {
                    this.applyAnticipatedPhoneme(currentPhoneme, nextPhoneme, anticipationFactor);
                }, currentTime + anticipationOffset);
            }

            // Apply phoneme-specific duration
            const durationMultiplier = this.phonemeDurations[currentPhoneme] || 1.0;
            const phonemeDuration = this.phonemeSpeedMs * durationMultiplier;

            // Update time for next phoneme
            currentTime += phonemeDuration;

            // Update last phoneme time to track when animation should end
            this.lastPhonemeTime = currentTime;

            // Log phoneme duration for debugging (only for a few phonemes to avoid console spam)
            if (i === 0 || i === phonemes.length - 1 || i % 10 === 0) {
                console.log(`Fallback phoneme ${currentPhoneme} duration: ${phonemeDuration}ms (multiplier: ${durationMultiplier})`);
            }
        }

        const syncMode = anticipationEnabled ? "with anticipation" : "without anticipation";
        console.log(`Character-based lip sync animation scheduled for approximately ${this.lastPhonemeTime + this.endDelayMs}ms ${syncMode}`);
    }

    getPhonemeFromChar(char, nextChar) {
        // Check for digraph TH first
        if (nextChar && char + nextChar === 'TH') return 'TTH';

        // Map characters to standard phonemes
        if ('AEIOU'.includes(char)) {
            const phonemeMap = {
                'A': 'AAA',
                'E': 'EH',
                'I': 'IEE',
                'O': 'OHH',
                'U': 'UUU'
            };
            return phonemeMap[char];
        }

        // Map consonants
        const consonantMap = {
            'F': 'FFF',
            'V': 'FFF',
            'M': 'MBP',
            'B': 'MBP',
            'P': 'MBP',
            'R': 'RRR',
            'S': 'SSS',
            'W': 'WWW'
        };

        return consonantMap[char] || 'MBP';
    }

    applyPhoneme(phoneme) {
        // Handle pause phonemes differently - reset mouth to neutral position
        if (phoneme === 'PAUSE_SHORT' || phoneme === 'PAUSE_MED' || phoneme === 'PAUSE_LONG') {
            console.log(`Applying pause phoneme: ${phoneme}`);

            // Reset all non-emotion blend shapes for pauses
            Object.keys(this.blendShapeControls).forEach(name => {
                if (!this.blendShapeMapper.isProtectedEmotionShape(name)) {
                    this.targetBlendShapes.set(name, 0);
                }
            });

            // Apply natural jaw positions for different pause types
            let jawOpenValue = 0;

            if (phoneme === 'PAUSE_SHORT') {
                jawOpenValue = 0.0; // Very slight opening for short pauses
            } else if (phoneme === 'PAUSE_MED') {
                jawOpenValue = 0.0; // Modest opening for medium pauses
            } else if (phoneme === 'PAUSE_LONG') {
                jawOpenValue = 0.00; // Slightly more opening for long pauses, natural resting position
            }

            // Apply to all mouth/jaw-related controls across all model parts
            const jawControls = [
                // Main head mouth controls
                this.blendShapeControls['BlendShapes_Main.mouth_open_M'],
                this.blendShapeControls['BlendShape_Main.MouthOpen'],
                // Teeth mouth controls 
                this.blendShapeControls['BlendShapes_Mouth.mouth_open_M'],
                this.blendShapeControls['BlendShape_Mouth.MouthOpen'],
                // Beard mouth controls
                this.blendShapeControls['BlendShapes_Beard.mouth_open_M'],
                this.blendShapeControls['BlendShape_Beard.MouthOpen'],
                // Mustache mouth controls
                this.blendShapeControls['BlendShapes_Moustache.mouth_open_M'],
                this.blendShapeControls['BlendShape_Moustache.MouthOpen']
            ].filter(control => control && !this.blendShapeMapper.isProtectedEmotionShape(control.name));

            jawControls.forEach(control => {
                if (control) {
                    this.targetBlendShapes.set(control.name, jawOpenValue);
                }
            });

            return;
        }

        // Regular phoneme processing for non-pause phonemes
        const availableBlendShapes = Object.keys(this.blendShapeControls).filter(
            name => !this.blendShapeMapper.isProtectedEmotionShape(name)
        );

        // Get mapped shapes
        const mappedShapes = {
            head: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, phoneme, 'head'),
            mouth: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, phoneme, 'mouth'),
            beard: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, phoneme, 'beard'),
            moustache: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, phoneme, 'moustache')
        };

        // Reset all non-emotion blend shapes first
        Object.keys(this.blendShapeControls).forEach(name => {
            if (!this.blendShapeMapper.isProtectedEmotionShape(name)) {
                this.targetBlendShapes.set(name, 0);
            }
        });

        // Apply mapped shapes for each facial part
        Object.entries(mappedShapes).forEach(([part, shapes]) => {
            shapes.forEach(({ name, weight }) => {
                const control = this.blendShapeControls[name];
                if (control && !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                    this.targetBlendShapes.set(name, weight);
                }
            });
        });

        // Add jaw movement for vowels
        if (['AAA', 'EH', 'IEE', 'OHH', 'UUU'].includes(phoneme)) {
            const jawControls = [
                // Main head mouth controls
                this.blendShapeControls['BlendShapes_Mouth.mouth_open_M'],
                this.blendShapeControls['BlendShape_Main.MouthOpen'],
                // Teeth mouth controls 
                this.blendShapeControls['BlendShapes_Teeth.mouth_open_M'],
                this.blendShapeControls['BlendShape_Teeth.MouthOpen'],
                // Beard mouth controls
                this.blendShapeControls['BlendShapes_Beard.mouth_open_M'],
                this.blendShapeControls['BlendShape_Beard.MouthOpen'],
                // Mustache mouth controls
                this.blendShapeControls['BlendShapes_Moustache.mouth_open_M'],
                this.blendShapeControls['BlendShape_Moustache.MouthOpen']
            ].filter(control => control && !this.blendShapeMapper.isProtectedEmotionShape(control.name));

            jawControls.forEach(control => {
                if (control) {
                    this.targetBlendShapes.set(control.name, 0.5);
                }
            });
        }
    }

    applyAnticipatedPhoneme(currentPhoneme, nextPhoneme, blendFactor = 0.3) {
        if (!nextPhoneme) return;

        // Special handling for pause phonemes
        const isPausePhoneme = phoneme => ['PAUSE_SHORT', 'PAUSE_MED', 'PAUSE_LONG'].includes(phoneme);

        // If we're transitioning to a pause, gradually return to neutral
        if (isPausePhoneme(nextPhoneme)) {
            console.log(`Anticipating pause phoneme: ${nextPhoneme}`);

            // Gradually decrease mouth movements when approaching a pause
            Object.keys(this.blendShapeControls).forEach(name => {
                if (!this.blendShapeMapper.isProtectedEmotionShape(name)) {
                    const currentValue = this.targetBlendShapes.get(name) || 0;
                    // Reduce all blend shapes by the blend factor (moving toward neutral)
                    this.targetBlendShapes.set(name, currentValue * (1 - blendFactor));
                }
            });

            return;
        }

        // If we're coming out of a pause, don't apply anticipation
        // as we want a clean transition from silence to speech
        if (isPausePhoneme(currentPhoneme)) {
            return;
        }

        // Regular anticipation for normal phonemes
        const availableBlendShapes = Object.keys(this.blendShapeControls).filter(
            name => !this.blendShapeMapper.isProtectedEmotionShape(name)
        );

        // Get mapped shapes for both current and next phonemes
        const currentMappedShapes = {
            head: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, currentPhoneme, 'head'),
            mouth: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, currentPhoneme, 'mouth'),
            beard: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, currentPhoneme, 'beard'),
            moustache: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, currentPhoneme, 'moustache')
        };

        const nextMappedShapes = {
            head: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, nextPhoneme, 'head'),
            mouth: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, nextPhoneme, 'mouth'),
            beard: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, nextPhoneme, 'beard'),
            moustache: this.blendShapeMapper.mapPhonemeToBlendShapes(availableBlendShapes, nextPhoneme, 'moustache')
        };

        // Create a blended map of shape weights
        const blendedShapes = new Map();

        // Process current phoneme shapes with reduced weight
        Object.entries(currentMappedShapes).forEach(([part, shapes]) => {
            shapes.forEach(({ name, weight }) => {
                const control = this.blendShapeControls[name];
                if (control && !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                    blendedShapes.set(name, weight * (1 - blendFactor));
                }
            });
        });

        // Blend with next phoneme shapes
        Object.entries(nextMappedShapes).forEach(([part, shapes]) => {
            shapes.forEach(({ name, weight }) => {
                const control = this.blendShapeControls[name];
                if (control && !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                    const currentWeight = blendedShapes.get(name) || 0;
                    blendedShapes.set(name, currentWeight + (weight * blendFactor));
                }
            });
        });

        // Apply the blended shapes
        blendedShapes.forEach((weight, name) => {
            this.targetBlendShapes.set(name, weight);
        });

        // Handle jaw movement for vowels with anticipation
        const isCurrentVowel = ['AAA', 'EH', 'IEE', 'OHH', 'UUU'].includes(currentPhoneme);
        const isNextVowel = ['AAA', 'EH', 'IEE', 'OHH', 'UUU'].includes(nextPhoneme);

        if (isCurrentVowel || isNextVowel) {
            const jawControls = [
                // Main head mouth controls
                this.blendShapeControls['BlendShapes_Mouth.mouth_open_M'],
                this.blendShapeControls['BlendShape_Main.MouthOpen'],
                // Teeth mouth controls 
                this.blendShapeControls['BlendShapes_Teeth.mouth_open_M'],
                this.blendShapeControls['BlendShape_Teeth.MouthOpen'],
                // Beard mouth controls
                this.blendShapeControls['BlendShapes_Beard.mouth_open_M'],
                this.blendShapeControls['BlendShape_Beard.MouthOpen'],
                // Mustache mouth controls
                this.blendShapeControls['BlendShapes_Moustache.mouth_open_M'],
                this.blendShapeControls['BlendShape_Moustache.MouthOpen']
            ].filter(control => control && !this.blendShapeMapper.isProtectedEmotionShape(control.name));

            const jawWeight = isCurrentVowel ? 0.5 * (1 - blendFactor) : 0;
            const nextJawWeight = isNextVowel ? 0.5 * blendFactor : 0;
            const blendedJawWeight = jawWeight + nextJawWeight;

            jawControls.forEach(control => {
                if (control) {
                    this.targetBlendShapes.set(control.name, blendedJawWeight);
                }
            });
        }
    }

    interpolateBlendShapes(delta) {
        this.targetBlendShapes.forEach((targetValue, name) => {
            const currentValue = this.currentBlendShapes.get(name) || 0;
            const control = this.blendShapeControls[name];

            if (control && control.mesh && typeof control.index === 'number' &&
                !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                const t = Math.min(1, delta / (this.transitionDuration / 1000));
                const newValue = currentValue + (targetValue - currentValue) * t;

                control.mesh.morphTargetInfluences[control.index] = newValue;
                this.currentBlendShapes.set(name, newValue);
                control.value = newValue;
            }
        });
    }

    animate() {
        if (!this.isAnimating) return;

        const now = performance.now();
        const delta = (now - (this._lastFrame || now)) / 1000;
        this._lastFrame = now;

        this.interpolateBlendShapes(delta);

        requestAnimationFrame(() => this.animate());
    }

    /**
     * Set audio element for audio-based pause detection
     * @param {HTMLAudioElement} audioElement - The audio element to monitor
     * @param {Blob} audioBlob - Optional audio blob for analysis
     * @returns {Promise<Boolean>} - Resolves to true if analysis was successful
     */
    async setAudioSource(audioElement, audioBlob = null) {
        // Clear any existing audio source and analysis
        this.clearAudioSource();

        // Set the current audio element reference
        this.currentAudio = audioElement;

        // If we have an audio blob, analyze it for pauses
        if (audioBlob) {
            try {
                console.log('Analyzing audio blob for pauses...');
                this.detectedPauses = await this.audioAnalyzer.analyzeFromBlob(audioBlob);
                this.usingAudioBasedPauses = this.detectedPauses.length > 0;

                console.log(`Audio analysis complete. Detected ${this.detectedPauses.length} pauses.`);

                // Start monitoring audio position if we're using audio-based pauses
                if (this.usingAudioBasedPauses) {
                    this.startAudioPauseMonitoring();
                    return true;
                }
            } catch (error) {
                console.error('Error analyzing audio for pauses:', error);
                this.usingAudioBasedPauses = false;
            }
        } else if (audioElement.src) {
            try {
                // If we don't have a blob but have a URL, analyze from URL
                console.log('Analyzing audio URL for pauses...');
                this.detectedPauses = await this.audioAnalyzer.analyzeFromUrl(audioElement.src);
                this.usingAudioBasedPauses = this.detectedPauses.length > 0;

                console.log(`Audio URL analysis complete. Detected ${this.detectedPauses.length} pauses.`);

                // Start monitoring audio position if we're using audio-based pauses
                if (this.usingAudioBasedPauses) {
                    this.startAudioPauseMonitoring();
                    return true;
                }
            } catch (error) {
                console.error('Error analyzing audio URL for pauses:', error);
                this.usingAudioBasedPauses = false;
            }
        }

        return false;
    }

    /**
     * Clear current audio source and pause monitoring
     */
    clearAudioSource() {
        // Stop monitoring audio position
        if (this.pauseUpdateInterval) {
            clearInterval(this.pauseUpdateInterval);
            this.pauseUpdateInterval = null;
        }

        // Clear audio references
        this.currentAudio = null;
        this.detectedPauses = [];
        this.usingAudioBasedPauses = false;

        // Reset pause tracking state
        this.lastAppliedPauseId = null;
        this.currentlyInPause = false;

        console.log('Audio source cleared and pause tracking reset');
    }

    /**
     * Start monitoring audio playback position to detect pauses
     */
    startAudioPauseMonitoring() {
        // Clear any existing interval
        if (this.pauseUpdateInterval) {
            clearInterval(this.pauseUpdateInterval);
        }

        // Reset pause tracking state
        this.lastAppliedPauseId = null;
        this.currentlyInPause = false;

        // Start a new interval to check audio position
        this.pauseUpdateInterval = setInterval(() => {
            if (!this.currentAudio || !this.isAnimating || !this.usingAudioBasedPauses) {
                return;
            }

            // Get current audio playback time
            const currentTime = this.currentAudio.currentTime;

            // Check if we're in a pause
            const currentPause = this.audioAnalyzer.getPauseAtTime(currentTime);

            if (currentPause) {
                // Create a unique ID for this pause using start time as identifier
                const pauseId = `${currentPause.start.toFixed(3)}_${currentPause.type}`;

                // Only apply the pause when:
                // 1. We first enter a pause (currentlyInPause was false)
                // 2. OR we've entered a different pause than before (pauseId changed)
                if (!this.currentlyInPause || this.lastAppliedPauseId !== pauseId) {
                    // Apply the appropriate pause phoneme based on the pause type
                    this.applyPausePhoneme(currentPause.type);

                    // Log the pause for debugging
                    console.log(`Applying pause phoneme: ${currentPause.type}`);

                    // Update tracking state
                    this.lastAppliedPauseId = pauseId;
                    this.currentlyInPause = true;
                }

                // We're anticipating the next phoneme after this pause
                if (currentTime >= (currentPause.end - 0.05)) {
                    console.log(`Anticipating end of pause: ${currentPause.type}`);
                }
            } else if (this.currentlyInPause) {
                // We've just exited a pause
                console.log(`Exited pause`);
                this.currentlyInPause = false;

                // Note: we keep the lastAppliedPauseId to prevent oscillation at pause boundaries
                // It will only be replaced when we detect a new valid pause
            }
        }, 50); // Check every 50ms (20 times per second)

        console.log('Started audio-based pause monitoring with improved state tracking and jitter prevention');
    }

    /**
     * Apply a pause phoneme type directly (used for audio-based pauses)
     * @param {string} pauseType - The type of pause to apply (PAUSE_SHORT, PAUSE_MED, PAUSE_LONG)
     */
    applyPausePhoneme(pauseType) {
        // Only handle recognized pause types
        if (!['PAUSE_SHORT', 'PAUSE_MED', 'PAUSE_LONG'].includes(pauseType)) {
            return;
        }

        console.log(`Applying pause phoneme from audio analysis: ${pauseType}`);

        // Reset all non-emotion blend shapes for pauses to zero
        // This creates a neutral mouth position during pauses
        Object.keys(this.blendShapeControls).forEach(name => {
            if (!this.blendShapeMapper.isProtectedEmotionShape(name)) {
                this.targetBlendShapes.set(name, 0);
            }
        });
    }

    stopAnimation() {
        this.isAnimating = false;

        // Clear any audio monitoring
        this.clearAudioSource();

        this.resetBlendShapes();
    }

    resetBlendShapes() {
        // Only clear non-emotion blend shapes
        [...this.targetBlendShapes.keys()].forEach(name => {
            if (!this.blendShapeMapper.isProtectedEmotionShape(name)) {
                this.targetBlendShapes.delete(name);
                this.currentBlendShapes.delete(name);
            }
        });

        Object.entries(this.blendShapeControls).forEach(([name, control]) => {
            if (control.mesh && typeof control.index === 'number' &&
                !this.blendShapeMapper.isProtectedEmotionShape(name)) {
                control.mesh.morphTargetInfluences[control.index] = 0;
                control.value = 0;
            }
        });
    }

    /**
     * Set up UI controls for lip sync anticipation settings
     */
    setupUI() {
        const debugPanel = document.getElementById('debug-panel');
        if (!debugPanel) {
            console.log('Debug panel not found, skipping lip sync UI setup');
            return;
        }

        const lipSyncControls = document.createElement('div');
        lipSyncControls.className = 'mt-4';
        lipSyncControls.innerHTML = `
            <small class="text-muted">Lip Sync Controls:</small>
            <div class="mb-2">
                <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="anticipation-toggle" ${this.anticipation.enabled ? 'checked' : ''}>
                    <span class="form-check-label">Enable Anticipation</span>
                </label>
            </div>
            <div class="mb-2">
                <label class="form-label small">Anticipation Factor</label>
                <input type="range" class="form-range" id="anticipation-factor"
                       min="0" max="1" step="0.05" value="${this.anticipation.factor}">
                <small class="text-muted" id="anticipation-factor-value">${this.anticipation.factor.toFixed(2)}</small>
            </div>
            <div class="mb-2">
                <label class="form-label small">Anticipation Timing</label>
                <input type="range" class="form-range" id="anticipation-timing"
                       min="0.1" max="0.9" step="0.05" value="${this.anticipation.offsetFactor}">
                <small class="text-muted" id="anticipation-timing-value">${this.anticipation.offsetFactor.toFixed(2)}</small>
            </div>
            <div class="mb-2">
                <label class="form-label small">Transition Duration (ms)</label>
                <input type="range" class="form-range" id="transition-duration"
                       min="50" max="300" step="10" value="${this.transitionDuration}">
                <small class="text-muted" id="transition-duration-value">${this.transitionDuration}ms</small>
            </div>
        `;

        debugPanel.appendChild(lipSyncControls);

        // Set up event listeners
        const anticipationToggle = document.getElementById('anticipation-toggle');
        const anticipationFactor = document.getElementById('anticipation-factor');
        const anticipationFactorValue = document.getElementById('anticipation-factor-value');
        const anticipationTiming = document.getElementById('anticipation-timing');
        const anticipationTimingValue = document.getElementById('anticipation-timing-value');
        const transitionDuration = document.getElementById('transition-duration');
        const transitionDurationValue = document.getElementById('transition-duration-value');

        if (anticipationToggle) {
            anticipationToggle.addEventListener('change', () => {
                this.setAnticipation({ enabled: anticipationToggle.checked });
            });
        }

        if (anticipationFactor && anticipationFactorValue) {
            anticipationFactor.addEventListener('input', () => {
                const value = parseFloat(anticipationFactor.value);
                anticipationFactorValue.textContent = value.toFixed(2);
                this.setAnticipation({ factor: value });
            });
        }

        if (anticipationTiming && anticipationTimingValue) {
            anticipationTiming.addEventListener('input', () => {
                const value = parseFloat(anticipationTiming.value);
                anticipationTimingValue.textContent = value.toFixed(2);
                this.setAnticipation({ offsetFactor: value });
            });
        }

        if (transitionDuration && transitionDurationValue) {
            transitionDuration.addEventListener('input', () => {
                const value = parseInt(transitionDuration.value);
                transitionDurationValue.textContent = `${value}ms`;
                this.transitionDuration = value;
            });
        }

        console.log('Lip sync UI controls initialized');
    }
}
