import logging
import re
import pronouncing

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CMU_TO_STANDARD_PHONEME = {
    # --- Vowels ---
    'AA': 'AAA',  # Low back vowel ("father") – wide open jaw, relaxed lips
    'AE': 'AAA',  # Low front vowel ("cat") – visually similar to AA, wide open
    'AH': 'AHH',  # Mid central vowel ("cup") – relaxed, neutral shape
    'AO': 'OHH',  # Mid back rounded vowel ("thought") – rounded lips
    'AW': 'AAA',  # Diphthong ("now") – starts open like AA, ends rounded
    'AY': 'AAA',  # Diphthong ("my") – starts open (like AA), ends high
    'EH': 'EH',  # Mid front vowel ("met") – mouth slightly open, neutral lips
    'ER':
    'RRR',  # Rhotic vowel ("her") – slight lip rounding, tight tongue curl
    'EY': 'EH',  # Diphthong ("they") – starts like EH, ends high
    'IH': 'IEE',  # High front vowel ("bit") – small smile, closed jaw
    'IY': 'IEE',  # High front vowel ("beet") – tighter than IH, more tension
    'OW': 'OHH',  # Diphthong ("go") – rounded lips, starts mid, ends high
    'OY': 'OHH',  # Diphthong ("boy") – starts rounded, visually like OW
    'UH': 'UUU',  # High back vowel ("book") – tightly rounded lips
    'UW': 'UUU',  # High back vowel ("food") – pursed lips, round

    # --- Consonants: Bilabial (lips) ---
    'P': 'MBP',  # ("pat") – lips closed and burst open
    'B': 'MBP',  # ("bat") – visually same as P
    'M': 'MBP',  # ("man") – lips sealed, soft release

    # --- Consonants: Labiodental (lip + teeth) ---
    'F': 'FFF',  # ("fan") – bottom lip touches upper teeth
    'V': 'FFF',  # ("van") – visually identical to F

    # --- Consonants: Alveolar / Dental (tongue + teeth) ---
    'T': 'TTH',  # ("top") – tongue to upper front teeth
    'D': 'TTH',  # ("dog") – same as T
    'N': 'TTH',  # ("no") – tongue to upper teeth, nasal
    'TH': 'TTH',  # ("think") – tongue between teeth
    'DH': 'TTH',  # ("this") – voiced version of TH
    'L': 'TTH',  # ("light") – tongue lifts to roof

    # --- Consonants: Velar / Glottal / Approximants ---
    'K': 'TTH',  # ("cat") – back of tongue raised, neutral lips
    'G': 'TTH',  # ("go") – same as K
    'NG': 'TTH',  # ("sing") – nasal, mouth closed
    'HH': 'AHH',  # ("hat") – breathy, neutral shape
    'R': 'RRR',  # ("red") – lips slightly rounded, tongue curls
    'W': 'UUU',  # ("wet") – rounded lips, like saying "oo"
    'Y': 'IEE',  # ("yes") – lips spread like IY

    # --- Consonants: Fricatives & Affricates ---
    'CH': 'SSS',  # ("cheese") – puckered lips, similar to SH
    'JH': 'SSS',  # ("jump") – visually like CH
    'SH': 'SSS',  # ("shoe") – rounded lips, tongue back
    'ZH': 'SSS',  # ("measure") – same shape as SH
    'S': 'SSS',  # ("see") – teeth close together, tongue behind
    'Z': 'SSS',  # ("zoo") – same as S
}


def clean_word(word):
    return re.sub(r'[^a-zA-Z\']', '', word).upper()


def get_phonemes_for_word(word):
    word = clean_word(word)
    if not word:
        return []
    try:
        phones = pronouncing.phones_for_word(word)
        if phones:
            phonemes = phones[0].split()
            phonemes = [re.sub(r'\d+$', '', p) for p in phonemes]
            # Print raw CMU phonemes to console
            print(f"Raw CMU phonemes for '{word}': {phonemes}")
            return phonemes
        else:
            logger.warning(f"No pronunciation found for word: {word}")
            return [char for char in word]
    except Exception as e:
        logger.error(f"Error getting phonemes for word '{word}': {str(e)}")
        return [char for char in word]


def text_to_phonemes(text):
    if not text:
        return []

    # Enhanced pattern to capture words, punctuation, and potential pauses
    pattern = r'\b[\w\']+\b|[.,;:?!-]|\s+'
    tokens = re.findall(pattern, text)

    result = []
    for token in tokens:
        # Skip processing for simple whitespace
        if token.isspace():
            continue

        # Handle pauses based on punctuation
        if token in ['.', '!', '?']:
            # Long pause (end of sentence)
            result.append({'word': token, 'phonemes': ['PAUSE_LONG']})
        elif token in [',', ';', ':']:
            # Medium pause (phrase boundary)
            result.append({'word': token, 'phonemes': ['PAUSE_MED']})
        elif token == '-':
            # Short pause (slight break)
            result.append({'word': token, 'phonemes': ['PAUSE_SHORT']})
        else:
            # Regular word processing
            phonemes = get_phonemes_for_word(token)
            if phonemes:
                result.append({'word': token, 'phonemes': phonemes})

    return result


def map_to_standard_phonemes(phoneme_list):
    result = []
    for word_data in phoneme_list:
        standard_phonemes = []
        raw_phonemes = word_data['phonemes']

        # Print raw CMU phonemes before mapping
        if raw_phonemes and not any(
                p in ['PAUSE_LONG', 'PAUSE_MED', 'PAUSE_SHORT']
                for p in raw_phonemes):
            print(f"Mapping '{word_data['word']}': {raw_phonemes} -> ", end="")

        for phoneme in raw_phonemes:
            # Special handling for pause phonemes - keep them as is
            if phoneme in ['PAUSE_LONG', 'PAUSE_MED', 'PAUSE_SHORT']:
                standard_phonemes.append(phoneme)
            elif phoneme in CMU_TO_STANDARD_PHONEME:
                standard_phonemes.append(CMU_TO_STANDARD_PHONEME[phoneme])
            else:
                standard_phonemes.append('SCHWA')
                print(
                    f"\nWARNING: Unknown CMU phoneme '{phoneme}' mapped to SCHWA"
                )

        # Complete the mapping output
        if raw_phonemes and not any(
                p in ['PAUSE_LONG', 'PAUSE_MED', 'PAUSE_SHORT']
                for p in raw_phonemes):
            print(f"{standard_phonemes}")

        result.append({
            'word': word_data['word'],
            'raw_phonemes': raw_phonemes,  # Keep original for reference
            'phonemes': standard_phonemes
        })
    return result


def analyze_text(text):
    print(f"\n=== PHONETIC ANALYSIS START ===")
    print(f"Analyzing text: '{text}'")
    print("-" * 50)

    logger.info(f"Analyzing text: {text}")
    phoneme_list = text_to_phonemes(text)

    print("-" * 50)
    print("MAPPING CMU TO STANDARD PHONEMES:")
    standard_phonemes = map_to_standard_phonemes(phoneme_list)

    flat_phonemes = []
    flat_raw_phonemes = []
    for word_data in standard_phonemes:
        flat_phonemes.extend(word_data['phonemes'])
        if 'raw_phonemes' in word_data:
            flat_raw_phonemes.extend(word_data['raw_phonemes'])
        # No longer adding word boundary markers since we have pause markers

    print("-" * 50)
    print("FINAL RESULTS:")
    print(f"Raw CMU sequence: {flat_raw_phonemes}")
    print(f"Standard sequence: {flat_phonemes}")
    print(f"=== PHONETIC ANALYSIS COMPLETE ===\n")

    logger.info(f"Phoneme analysis complete: {flat_phonemes}")
    return {
        'detailed': standard_phonemes,
        'sequence': flat_phonemes,
        'raw_sequence': flat_raw_phonemes
    }


def test_analysis():
    test_texts = [
        "Hello world", "The quick brown fox jumps over the lazy dog",
        "How are you today?",
        "First, let me think about that. Well, I believe the answer is clear.",
        "Stop - and listen to this important message!",
        "Hello, my name is John. I'm a software developer."
    ]

    for text in test_texts:
        result = analyze_text(text)
        print(f"\nText: '{text}'")
        print(f"Phonemes: {result['sequence']}")

        print("Word breakdown:")
        for word_data in result['detailed']:
            print(f"  {word_data['word']}: {word_data['phonemes']}")


if __name__ == "__main__":
    test_analysis()
