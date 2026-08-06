export interface PricingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number; // monthly price when billed annually
  features: string[];
  description: string;
  isPopular?: boolean;
  ctaText: string;
  ctaLink: string;
  customPrice?: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: string;
  icon: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export const pricingPlans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    priceAnnual: 39,
    description: '1 WhatsApp number, 500 conversations/mo',
    features: [
      'Basic AI Automation',
      'Standard Support',
      'Mobile App Access'
    ],
    ctaText: 'Start Free Trial',
    ctaLink: '/signup'
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 149,
    priceAnnual: 119,
    description: '3 numbers, 5K conversations/mo, CRM + Broadcast',
    features: [
      'Everything in Starter',
      'CRM Integration',
      'Broadcast Campaigns',
      'Priority Support'
    ],
    isPopular: true,
    ctaText: 'Start Free Trial',
    ctaLink: '/signup'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 0,
    priceAnnual: 0,
    description: 'Unlimited, SSO, white-label, dedicated support',
    features: [
      'Custom API Access',
      'SSO & SAML Authentication',
      'Dedicated Success Manager',
      '24/7 Phone Support'
    ],
    customPrice: true,
    ctaText: 'Talk to Sales',
    ctaLink: '#sales-modal'
  }
];

export const addOns: AddOn[] = [
  {
    id: 'extra-number',
    name: 'Extra WhatsApp Number',
    description: 'Expand your reach with more numbers.',
    price: '$29/mo',
    icon: 'add_to_home_screen'
  },
  {
    id: 'extra-seat',
    name: 'Extra Agent Seat',
    description: 'Give your team more power to respond.',
    price: '$15/mo',
    icon: 'person_add'
  },
  {
    id: 'extra-credits',
    name: 'Extra AI Credits',
    description: '1,000 more AI-powered conversations.',
    price: '$10/1K',
    icon: 'generating_tokens'
  },
  {
    id: 'white-label',
    name: 'White-label Branding',
    description: "Remove 'Powered by' and use your logo.",
    price: '$99/mo',
    icon: 'branding_watermark'
  }
];

export const faqs: FAQItem[] = [
  {
    question: 'Can I change plans later?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.'
  },
  {
    question: 'Is there a setup fee?',
    answer: 'No, there are no hidden setup fees. You only pay the monthly or annual subscription price plus any optional add-ons.'
  },
  {
    question: 'How do AI credits work?',
    answer: 'Each plan comes with a monthly quota of AI conversations. If you exceed this, you can purchase top-up credits at any time.'
  },
  {
    question: 'What support options are available?',
    answer: 'All plans include email support. Growth plans get priority response times, while Enterprise plans enjoy a dedicated account manager and 24/7 phone support.'
  },
  {
    question: 'Is my data secure?',
    answer: 'OneAIAssist is HIPAA compliant and SOC2 certified. We use enterprise-grade encryption and strict data access policies to keep your customer information safe.'
  }
];
