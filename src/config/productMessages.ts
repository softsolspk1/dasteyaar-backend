/**
 * Product-specific WhatsApp message templates and pricing
 */

interface ProductMessageConfig {
  dosage: string;
  retailPrice: number;
  specialPrice: number;
  videoLink: string;
  messageTemplate: (patientName: string, doctorName: string, dosage: string, retailPrice: string, specialPrice: string, videoLink: string) => string;
}

interface ProductMessagesMap {
  [key: string]: ProductMessageConfig;
}

/**
 * Clean doctor name - remove "Dr." or "Doctor" prefix
 */
function cleanDoctorNameUtil(name: string): string {
  if (!name) return '';

  // Remove "Dr." or "Doctor" prefix (case insensitive)
  let cleaned = name.trim();
  cleaned = cleaned.replace(/^(dr\.|doctor)\s*/i, '').trim();

  return cleaned;
}

const productMessages: ProductMessagesMap = {
  cinora: {
    dosage: '1 injection every 15 days',
    retailPrice: 90000,
    specialPrice: 40000,
    videoLink: 'https://youtu.be/E0JYW8zeMzo',
    messageTemplate: (patientName: string, doctorName: string, dosage: string, retailPrice: string, specialPrice: string, videoLink: string) => {
      const cleanedName = cleanDoctorNameUtil(doctorName);
      return `Dear ${patientName}, 👋

Dr. ${cleanedName} has prescribed you CinnoRA Injection.
Please find your treatment details below:

💉 Dosage: ${dosage}
💰 Retail Price: PKR ${retailPrice}
🌟 Special Access Price (Dast e Yaar Program): PKR ${specialPrice}

Our Product Information Officer will contact you shortly to take your details and arrange cold-chain delivery.

For more information, you can reach us anytime.

Team Dast e Yaar
CCL Pharma | Patient Access & Support Program

1️⃣ 📞 Call Dast e Yaar → tel:03248855666
2️⃣ 🎥 Watch CinnoRA Video → ${videoLink}
3️⃣ 💬 Chat on WhatsApp → https://wa.me/923248855666`;
    },
  },

  cinnora: {
    dosage: '1 injection every 15 days',
    retailPrice: 90000,
    specialPrice: 40000,
    videoLink: 'https://youtu.be/E0JYW8zeMzo',
    messageTemplate: (patientName: string, doctorName: string, dosage: string, retailPrice: string, specialPrice: string, videoLink: string) => {
      const cleanedName = cleanDoctorNameUtil(doctorName);
      return `Dear ${patientName}, 👋

Dr. ${cleanedName} has prescribed you CinnoRA Injection.
Please find your treatment details below:

💉 Dosage: ${dosage}
💰 Retail Price: PKR ${retailPrice}
🌟 Special Access Price (Dast e Yaar Program): PKR ${specialPrice}

Our Product Information Officer will contact you shortly to take your details and arrange cold-chain delivery.

For more information, you can reach us anytime.

Team Dast e Yaar
CCL Pharma | Patient Access & Support Program

1️⃣ 📞 Call Dast e Yaar → tel:03248855666
2️⃣ 🎥 Watch CinnoRA Video → ${videoLink}
3️⃣ 💬 Chat on WhatsApp → https://wa.me/923248855666`;
    },
  },

  cinnopar: {
    dosage: 'Daily usage prefilled injection',
    retailPrice: 45000,
    specialPrice: 26500,
    videoLink: 'https://www.youtube.com/watch?v=Ep9kmIaVbEo',
    messageTemplate: (patientName: string, doctorName: string, dosage: string, retailPrice: string, specialPrice: string, videoLink: string) => {
      const cleanedName = cleanDoctorNameUtil(doctorName);
      return `Dear ${patientName}, 👋

Dr. ${cleanedName} has prescribed you Cinnopar Injection.
Please find your treatment details below:

💉 Dosage: ${dosage}
💰 Retail Price: PKR ${retailPrice}
🌟 Special Access Price (Dast e Yaar Program): PKR ${specialPrice}

Our Product Information Officer will contact you shortly to take your details and arrange cold-chain delivery.

For more information, you can reach us anytime.

Team Dast e Yaar
CCL Pharma | Patient Access & Support Program

1️⃣ 📞 Call Dast e Yaar → tel:03248855666
2️⃣ 🎥 Watch Cinnopar Video → ${videoLink}
3️⃣ 💬 Chat on WhatsApp → https://wa.me/923248855666`;
    },
  },
};

/**
 * Get product configuration by product name
 * Performs case-insensitive matching with flexible pattern matching
 */
export function getProductConfig(productName: string): ProductMessageConfig | null {
  if (!productName) return null;

  // Normalize product name - remove spaces and convert to lowercase
  const normalized = productName.toLowerCase().replace(/\s+/g, '');

  // Try exact match first
  if (productMessages[normalized]) {
    return productMessages[normalized];
  }

  // Handle common variations:
  // "cinnora" matches "cinora" and vice versa
  if (normalized === 'cinnora' && productMessages['cinora']) {
    return productMessages['cinora'];
  }
  if (normalized === 'cinora' && productMessages['cinnora']) {
    return productMessages['cinnora'];
  }

  // Try partial matching for other variations
  for (const [key, config] of Object.entries(productMessages)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return config;
    }
  }

  return null;
}

/**
 * Get all available product names
 */
export function getAvailableProducts(): string[] {
  return Object.keys(productMessages);
}

export default productMessages;

