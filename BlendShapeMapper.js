/**
 * Manages blend shape mapping across different character models
 */
export class BlendShapeMapper {
  constructor() {
    // Protected emotion-related blend shapes that should not be modified
    this.protectedEmotionShapes = [
      // Convention 1 
      'BlendShapes_Main.happy_M', 'BlendShapes_EyeLashes.happy_M', 'BlendShapes_Eyebrows.happy_M', 'BlendShapes_Beard.happy_M', 'BlendShapes_Moustache.happy_M', 'BlendShapes_Mouth.happy_M',
      'BlendShapes_Main.sad_M', 'BlendShapes_EyeLashes.sad_M', 'BlendShapes_Eyebrows.sad_M', 'BlendShapes_Beard.sad_M', 'BlendShapes_Moustache.sad_M',
      'BlendShapes_Main.angry_M', 'BlendShapes_EyeLashes.angry_M', 'BlendShapes_Eyebrows.angry_M', 'BlendShapes_Beard.angry_M', 'BlendShapes_Moustache.angry_M', 
      'BlendShapes_Main.surprise_M', 'BlendShapes_EyeLashes.surprise_M', 'BlendShapes_Eyebrows.surprise_M', 'BlendShapes_Beard.surprise_M', 'BlendShapes_Moustache.surprise_M', 'BlendShapes_Mouth.surprise_M',
      'BlendShapes_Main.fear_M', 'BlendShapes_EyeLashes.fear_M', 'BlendShapes_Eyebrows.fear_M', 'BlendShapes_Beard.fear_M', 'BlendShapes_Moustache.fear_M', 'BlendShapes_Mouth.fear_M',
      // Convention 2
      'BlendShape_Main.Happy', 'BlendShape_EyeLashes.Happy', 'BlendShape_Eyebrows.Happy', 'BlendShape_Beard.Happy',
      'BlendShape_Main.Sad', 'BlendShape_EyeLashes.Sad', 'BlendShape_Eyebrows.Sad', 'BlendShape_Beard.Sad',
      'BlendShape_Main.Angry', 'BlendShape_EyeLashes.Angry', 'BlendShape_Eyebrows.Angry', 'BlendShape_Beard.Angry',
      'BlendShape_Main.Surprise', 'BlendShape_EyeLashes.Surprise', 'BlendShape_Eyebrows.Surprise', 'BlendShape_Beard.Surprise',
      'BlendShape_Main.Fear', 'BlendShape_EyeLashes.Fear', 'BlendShape_Eyebrows.Fear', 'BlendShape_Beard.Fear', 'BlendShape_Mouth.Fear',
      'BlendShape_EyeR.EyeLookOut_R','BlendShape_EyeR.EyeLookOut_R','BlendShape_EyeL.EyeLookIn_L','BlendShape_EyeL.EyeLookOut_L'
    ];

   

    // Standard phoneme categories with all their variations across different models
    this.standardPhonemes = {
      AAA: ['aaa_M', 'AHH', 'Ahh'],
      EH: ['eh_M', 'EE'],
      AHH: ['ahh_M', 'AHH', 'Ahh'],
      OHH: ['ohh_M', 'OW', 'OU'],
      UUU: ['uuu_M', 'OU'],
      IEE: ['iee_M', 'EE'],
      RRR: ['rrr_M', 'R'],
      WWW: ['www_M', 'W'],
      SSS: ['sss_M'],
      FFF: ['fff_M', 'FV'],
      TTH: ['tth_M', 'TH', 'Th'],
      MBP: ['mbp_M', 'MBP'],
      TLDN: ['TLDN']
      //SSH: ['ssh_M'],
      //SCHWA: ['schwa_M']
    };

    // Mapping prefixes for different model parts
    this.prefixMappings = {
      head: ['BlendShapes_Main.', 'BlendShape_Main.'],
      mouth: ['BlendShapes_Mouth.', 'BlendShape_Mouth.'],
      beard: ['BlendShapes_Beard.', 'BlendShape_Beard.', 'BlendShapes_Beards.'],
      moustache: ['BlendShapes_Moustache.', 'BlendShape_Moustache.']
    };

    // Synced movement mappings - which shapes should move together
    this.syncedMovements = {
      AAA: {
        mouth: ['aaa_M', 'AHH', 'Ahh'],
        head: ['aaa_M', 'AHH', 'Ahh'],
        beard: ['aaa_M', 'AHH', 'Ahh'],
        moustache: ['aaa_M', 'AHH', 'Ahh']
      },
      EH: {
        mouth: ['eh_M', 'EE'],
        head: ['eh_M', 'EE'],
        beard: ['eh_M', 'EE'],
        moustache: ['eh_M', 'EE']
      },
      AHH: {
        mouth: ['ahh_M', 'AHH', 'Ahh'],
        head: ['ahh_M', 'AHH', 'Ahh'],
        beard: ['ahh_M', 'AHH', 'Ahh'],
        moustache: ['ahh_M', 'AHH', 'Ahh']
      },
      OHH: {
        mouth: ['ohh_M', 'OU'],
        head: ['ohh_M', 'OU'],
        beard: ['ohh_M', 'OU'],
        moustache: ['ohh_M', 'OU']
      },
      UUU: {
        mouth: ['uuu_M', 'OW'],
        head: ['uuu_M', 'OW'],
        beard: ['uuu_M', 'OW'],
        moustache: ['uuu_M', 'OW']
      },
      IEE: {
        mouth: ['iee_M', 'EE'],
        head: ['iee_M', 'EE'],
        beard: ['iee_M', 'EE'],
        moustache: ['iee_M', 'EE']
      },
      RRR: {
        mouth: ['rrr_M', 'R'],
        head: ['rrr_M', 'R'],
        beard: ['rrr_M', 'R'],
        moustache: ['rrr_M', 'R']
      },
      WWW: {
        mouth: ['www_M', 'W'],
        head: ['www_M', 'W'],
        beard: ['www_M', 'W'],
        moustache: ['www_M', 'W']
      },
      SSS: {
        mouth: ['sss_M', 'FV'],
        head: ['sss_M', 'FV'],
        beard: ['sss_M', 'FV'],
        moustache: ['sss_M', 'FV']
      },
      FFF: {
        mouth: ['fff_M', 'FV'],
        head: ['fff_M', 'FV'],
        beard: ['fff_M', 'FV'],
        moustache: ['fff_M', 'FV']
      },
      TTH: {
        mouth: ['tth_M', 'TH', 'Th'],
        head: ['tth_M', 'TH', 'Th'],
        beard: ['tth_M', 'TH', 'Th'],
        moustache: ['tth_M', 'TH', 'Th']
      },
      MBP: {
        mouth: ['mbp_M', 'MBP'],
        head: ['mbp_M', 'MBP'],
        beard: ['mbp_M', 'MBP'],
        moustache: ['mbp_M', 'MBP']
      },
      TLDN: {
        mouth: ['TLDN'],
        head: ['TLDN'],
        beard: ['TLDN'],
        moustache: ['TLDN']
      },
     /* 
     SSH: {
        mouth: ['ssh_M'],
        head: ['ssh_M'],
        beard: ['ssh_M'],
        moustache: ['ssh_M']
      },
      SCHWA: {
        mouth: ['schwa_M', 'TLDN'],
        head: ['schwa_M', 'TLDN'],
        beard: ['schwa_M', 'TLDN'],
        moustache: ['schwa_M', 'TLDN']
      }*/
    };
  }

  /**
   * Checks if a blend shape is emotion-related and should be protected
   * @param {String} shapeName - The name of the blend shape
   * @returns {Boolean} - True if the shape should be protected
   */
  isProtectedEmotionShape(shapeName) {
    // Check if shapeName is null or undefined
    if (!shapeName) {
      return false;
    }
    return this.protectedEmotionShapes.some(protectedShape =>
      shapeName.toLowerCase().includes(protectedShape.toLowerCase()));
  }

  /**
   * Maps a phoneme to blend shapes
   * @param {Object} availableBlendShapes - List of blend shapes in the model
   * @param {String} standardPhoneme - The standard phoneme to map
   * @param {String} modelPart - The part of the model
   * @returns {Array} - Array of matching blend shape names with weights
   */
  mapPhonemeToBlendShapes(availableBlendShapes, standardPhoneme, modelPart = 'head') {
    const phonemeVariants = this.standardPhonemes[standardPhoneme] || [];
    const prefixes = this.prefixMappings[modelPart] || [];
    const syncedShapes = this.syncedMovements[standardPhoneme]?.[modelPart] || [];
    const matches = [];

    // Filter out emotion-related shapes before processing
    const availableNonEmotionShapes = availableBlendShapes.filter(shape =>
      !this.isProtectedEmotionShape(shape));

    // Add standard phoneme variants
    for (const prefix of prefixes) {
      for (const variant of phonemeVariants) {
        const fullName = prefix + variant;
        if (availableNonEmotionShapes.includes(fullName)) {
          matches.push({
            name: fullName,
            weight: 0.7
          });
        }
      }

      // Add synced shapes
      for (const syncedShape of syncedShapes) {
        const fullName = prefix + syncedShape;
        if (availableNonEmotionShapes.includes(fullName) &&
            !matches.some(m => m.name === fullName)) {
          matches.push({
            name: fullName,
            weight: 0.7
          });
        }
      }
    }

    return matches;
  }

  /**
   * Gets all available standard phonemes for a given model
   * @param {Object} availableBlendShapes - List of blend shapes available in the model
   * @returns {Object} - Mapping of standard phonemes to available blend shapes
   */
  getAvailablePhonemes(availableBlendShapes) {
    const mapping = {};

    for (const [standardPhoneme, variants] of Object.entries(this.standardPhonemes)) {
      const headMatches = this.mapPhonemeToBlendShapes(availableBlendShapes, standardPhoneme, 'head');
      const mouthMatches = this.mapPhonemeToBlendShapes(availableBlendShapes, standardPhoneme, 'mouth');
      const beardMatches = this.mapPhonemeToBlendShapes(availableBlendShapes, standardPhoneme, 'beard');
      const moustacheMatches = this.mapPhonemeToBlendShapes(availableBlendShapes, standardPhoneme, 'moustache');

      if (headMatches.length > 0 || mouthMatches.length > 0 || beardMatches.length > 0 || moustacheMatches.length > 0) {
        mapping[standardPhoneme] = {
          head: headMatches,
          mouth: mouthMatches,
          beard: beardMatches,
          moustache: moustacheMatches
        };
      }
    }

    return mapping;
  }

  /**
   * Apply blend shapes based on phoneme
   * @param {Object} model - The 3D model
   * @param {String} phoneme - The standard phoneme to apply
   * @param {Number} weight - Base weight/intensity
   */
  applyPhonemeBlendShape(model, phoneme, weight = 0.7) {
    if (!model.morphTargetDictionary) return;

    const availableBlendShapes = Object.keys(model.morphTargetDictionary);
    const phonemeMapping = this.mapPhonemeToBlendShapes(availableBlendShapes, phoneme, 'head');

    for (const { name, weight: baseWeight } of phonemeMapping) {
      const index = model.morphTargetDictionary[name];
      if (typeof index !== 'undefined' && !this.isProtectedEmotionShape(name)) {
        model.morphTargetInfluences[index] = Math.min(weight * baseWeight, 1.0);
      }
    }
  }

  /**
   * Reset all non-emotion blend shapes to zero
   * @param {Object} model - The 3D model
   */
  resetBlendShapes(model) {
    if (!model.morphTargetInfluences || !model.morphTargetDictionary) return;

    // Only reset non-emotion blend shapes
    Object.entries(model.morphTargetDictionary).forEach(([name, index]) => {
      if (!this.isProtectedEmotionShape(name)) {
        model.morphTargetInfluences[index] = 0;
      }
    });
  }
}
