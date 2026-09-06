import { DynamicIntakeQuestion, ValidationType } from '@prisma/client';

export interface ValidationResult {
  isValid: boolean;
  normalizedValue?: any;
  rawValue: string;
  errorMessage?: string;
}

// Complete 50 US States + DC map
const US_STATES_MAP: Record<string, string> = {
  alabama: 'AL', al: 'AL',
  alaska: 'AK', ak: 'AK',
  arizona: 'AZ', az: 'AZ',
  arkansas: 'AR', ar: 'AR',
  california: 'CA', ca: 'CA', calif: 'CA',
  colorado: 'CO', co: 'CO',
  connecticut: 'CT', ct: 'CT',
  delaware: 'DE', de: 'DE',
  florida: 'FL', fl: 'FL', fla: 'FL',
  georgia: 'GA', ga: 'GA',
  hawaii: 'HI', hi: 'HI',
  idaho: 'ID', id: 'ID',
  illinois: 'IL', il: 'IL',
  indiana: 'IN', in: 'IN',
  iowa: 'IA', ia: 'IA',
  kansas: 'KS', ks: 'KS',
  kentucky: 'KY', ky: 'KY',
  louisiana: 'LA', la: 'LA',
  maine: 'ME', me: 'ME',
  maryland: 'MD', md: 'MD',
  massachusetts: 'MA', ma: 'MA', mass: 'MA',
  michigan: 'MI', mi: 'MI', mich: 'MI',
  minnesota: 'MN', mn: 'MN', minn: 'MN',
  mississippi: 'MS', ms: 'MS',
  missouri: 'MO', mo: 'MO',
  montana: 'MT', mt: 'MT',
  nebraska: 'NE', ne: 'NE',
  nevada: 'NV', nv: 'NV',
  'new hampshire': 'NH', nh: 'NH',
  'new jersey': 'NJ', nj: 'NJ',
  'new mexico': 'NM', nm: 'NM',
  'new york': 'NY', ny: 'NY',
  'north carolina': 'NC', nc: 'NC',
  'north dakota': 'ND', nd: 'ND',
  ohio: 'OH', oh: 'OH',
  oklahoma: 'OK', ok: 'OK',
  oregon: 'OR', or: 'OR',
  pennsylvania: 'PA', pa: 'PA', penn: 'PA',
  'rhode island': 'RI', ri: 'RI',
  'south carolina': 'SC', sc: 'SC',
  'south dakota': 'SD', sd: 'SD',
  tennessee: 'TN', tn: 'TN', tenn: 'TN',
  texas: 'TX', tx: 'TX',
  utah: 'UT', ut: 'UT',
  vermont: 'VT', vt: 'VT',
  virginia: 'VA', va: 'VA',
  washington: 'WA', wa: 'WA', wash: 'WA',
  'west virginia': 'WV', wv: 'WV',
  wisconsin: 'WI', wi: 'WI', wisc: 'WI',
  wyoming: 'WY', wy: 'WY',
  'district of columbia': 'DC', dc: 'DC',
};

export class FieldValidator {
  /**
   * Deterministically validates and normalizes user input against a question's ValidationType.
   */
  static validate(question: DynamicIntakeQuestion, rawMessage: string): ValidationResult {
    const text = (rawMessage || '').trim();
    if (!text) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Response cannot be empty.',
      };
    }

    switch (question.validationType) {
      case 'NUMBER':
        return this.validateNumber(question, text);

      case 'US_STATE':
        return this.validateUSState(question, text);

      case 'CURRENCY':
        return this.validateCurrency(question, text);

      case 'ENUM':
        return this.validateEnum(question, text);

      case 'PHONE':
        return this.validatePhone(question, text);

      case 'EMAIL':
        return this.validateEmail(question, text);

      case 'DATE':
        return this.validateDate(question, text);

      case 'TEXT':
      default:
        return {
          isValid: true,
          normalizedValue: text,
          rawValue: text,
        };
    }
  }

  private static validateNumber(question: DynamicIntakeQuestion, text: string): ValidationResult {
    // Extract first continuous digits sequence
    const match = text.match(/\b(\d+)\b/);
    if (!match) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: `Please enter a valid number for ${question.fieldKey}.`,
      };
    }

    const num = parseInt(match[1], 10);
    if (isNaN(num)) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: `Invalid numeric value.`,
      };
    }

    // Contextual sanity checks
    if (question.fieldKey.toLowerCase().includes('age')) {
      if (num < 0 || num > 120) {
        return {
          isValid: false,
          rawValue: text,
          errorMessage: 'Please enter a valid age between 1 and 120.',
        };
      }
    }

    if (question.fieldKey.toLowerCase().includes('family') || question.fieldKey.toLowerCase().includes('size')) {
      if (num < 1 || num > 30) {
        return {
          isValid: false,
          rawValue: text,
          errorMessage: 'Please enter a valid family size between 1 and 30.',
        };
      }
    }

    return {
      isValid: true,
      normalizedValue: num,
      rawValue: text,
    };
  }

  private static validateUSState(question: DynamicIntakeQuestion, text: string): ValidationResult {
    const rawTrimmed = text.trim();
    const cleanLower = rawTrimmed.toLowerCase().replace(/[^a-z\s]/g, ' ').trim();
    const words = cleanLower.split(/\s+/).filter(Boolean);
    const rawWords = rawTrimmed.split(/[\s,.-]+/).filter(Boolean);
    
    // 1. Check multi-word state names first (e.g. 'new york', 'north carolina', 'rhode island')
    for (const [stateName, code] of Object.entries(US_STATES_MAP)) {
      if (stateName.includes(' ') && cleanLower.includes(stateName)) {
        return {
          isValid: true,
          normalizedValue: code,
          rawValue: text,
        };
      }
    }

    // 2. Check full single-word state names (e.g. 'texas', 'california', 'florida', 'alaska')
    for (const word of words) {
      if (word.length > 2 && US_STATES_MAP[word]) {
        return {
          isValid: true,
          normalizedValue: US_STATES_MAP[word],
          rawValue: text,
        };
      }
    }

    // 3. Check 2-letter state abbreviations:
    // If short input (<= 3 words, e.g. "TX", "in TX", "tx please"), allow case-insensitive 2-letter code
    if (words.length <= 3) {
      for (const word of words) {
        if (word.length === 2 && US_STATES_MAP[word]) {
          return {
            isValid: true,
            normalizedValue: US_STATES_MAP[word],
            rawValue: text,
          };
        }
      }
    } else {
      // In longer sentences (> 3 words), 2-letter code must be uppercase in raw text (e.g. "I am currently living in TX with my family")
      // to avoid false positives on words like "in", "or", "me", "co", "hi", "ok", "pa", "la"
      for (const rw of rawWords) {
        if (rw.length === 2 && rw === rw.toUpperCase() && US_STATES_MAP[rw.toLowerCase()]) {
          return {
            isValid: true,
            normalizedValue: US_STATES_MAP[rw.toLowerCase()],
            rawValue: text,
          };
        }
      }
    }

    return {
      isValid: false,
      rawValue: text,
      errorMessage: 'Please enter a valid 2-letter US state code or state name (e.g. TX, California, NY).',
    };
  }

  private static validateCurrency(question: DynamicIntakeQuestion, text: string): ValidationResult {
    // Check for ranges like "$100 - $250", "100 to 250", "150-200"
    const rangeMatch = text.match(/\$?(\d+(?:\.\d+)?)\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
      const lower = parseFloat(rangeMatch[1]);
      const upper = parseFloat(rangeMatch[2]);
      // Upper bound is used as the budget ceiling for SQL filtering
      const ceiling = Math.max(lower, upper);
      return {
        isValid: true,
        normalizedValue: Math.round(ceiling),
        rawValue: text,
      };
    }

    // Match single amounts like "$150", "150/mo", "around 200 bucks", "250"
    const match = text.match(/\$?(\d+(?:\.\d+)?)/);
    if (!match) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Please enter a monthly budget amount in dollars (e.g. $150 or $200/mo).',
      };
    }

    const val = parseFloat(match[1]);
    if (isNaN(val) || val <= 0) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Please enter a valid positive dollar amount.',
      };
    }

    return {
      isValid: true,
      normalizedValue: Math.round(val),
      rawValue: text,
    };
  }

  private static validateEnum(question: DynamicIntakeQuestion, text: string): ValidationResult {
    const rawOptions = question.options;
    let options: string[] = [];

    if (Array.isArray(rawOptions)) {
      options = rawOptions.map((o) => String(o).trim());
    } else if (typeof rawOptions === 'string') {
      try {
        const parsed = JSON.parse(rawOptions);
        if (Array.isArray(parsed)) {
          options = parsed.map((o) => String(o).trim());
        }
      } catch {
        options = rawOptions.split(',').map((o) => o.trim());
      }
    }

    if (options.length === 0) {
      return {
        isValid: true,
        normalizedValue: text,
        rawValue: text,
      };
    }

    const lowerInput = text.toLowerCase().trim();

    // 1. Exact match (case-insensitive)
    const exactMatch = options.find((opt) => opt.toLowerCase() === lowerInput);
    if (exactMatch) {
      return {
        isValid: true,
        normalizedValue: exactMatch,
        rawValue: text,
      };
    }

    // 2. Unambiguous Substring match (strictly only if exactly 1 option matches)
    const substringMatches = options.filter(
      (opt) =>
        lowerInput.includes(opt.toLowerCase()) || opt.toLowerCase().includes(lowerInput)
    );

    if (substringMatches.length === 1) {
      return {
        isValid: true,
        normalizedValue: substringMatches[0],
        rawValue: text,
      };
    }

    // Ambiguous or zero matches: reject and show options
    return {
      isValid: false,
      rawValue: text,
      errorMessage: `Please choose one of the following options: ${options.join(', ')}`,
    };
  }

  private static validatePhone(question: DynamicIntakeQuestion, text: string): ValidationResult {
    const digits = text.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Please enter a valid phone number with area code.',
      };
    }
    return {
      isValid: true,
      normalizedValue: digits.startsWith('1') && digits.length === 11 ? `+${digits}` : `+1${digits}`,
      rawValue: text,
    };
  }

  private static validateEmail(question: DynamicIntakeQuestion, text: string): ValidationResult {
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!match) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Please enter a valid email address (e.g. name@example.com).',
      };
    }
    return {
      isValid: true,
      normalizedValue: match[0].toLowerCase(),
      rawValue: text,
    };
  }

  private static validateDate(question: DynamicIntakeQuestion, text: string): ValidationResult {
    const parsed = Date.parse(text);
    if (isNaN(parsed)) {
      return {
        isValid: false,
        rawValue: text,
        errorMessage: 'Please enter a valid date (e.g. YYYY-MM-DD or MM/DD/YYYY).',
      };
    }
    return {
      isValid: true,
      normalizedValue: new Date(parsed).toISOString().split('T')[0],
      rawValue: text,
    };
  }
}
