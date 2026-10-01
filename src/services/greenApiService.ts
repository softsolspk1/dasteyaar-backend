import axios, { AxiosInstance } from 'axios';
import logger from '../config/logger';
import { getProductConfig } from '../config/productMessages';

interface GreenAPIMessage {
  chatId: string;
  message: string;
}

interface GreenAPIResponse {
  idMessage: string;
}

interface PrescriptionMessageData {
  patientName: string;
  patientPhone: string;
  mrn: string;
  doctorName: string; // NEW: Doctor name for personalized message
  productName: string;
  quantity?: number;
  orderNumber?: string;
}

class GreenAPIService {
  private apiClient: AxiosInstance;
  private idInstance: string;
  private apiToken: string;

  constructor() {
    this.idInstance = process.env.GREENAPI_ID_INSTANCE || '';
    this.apiToken = process.env.GREENAPI_API_TOKEN || '';

    const prefix = this.idInstance ? this.idInstance.substring(0, 4) : 'api';

    this.apiClient = axios.create({
      baseURL: `https://${prefix}.api.green-api.com`,
      timeout: 10000,
    });
  }

  /**
   * Format phone number to GreenAPI format (chatId)
   * Removes +, spaces, dashes and adds @c.us suffix
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except country code indicator
    const cleaned = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

    // Ensure it has country code (if not present, assume Pakistan +92)
    let formatted = cleaned;
    if (!cleaned.startsWith('92')) {
      // If starts with 0, replace with 92
      if (cleaned.startsWith('0')) {
        formatted = '92' + cleaned.substring(1);
      } else {
        formatted = '92' + cleaned;
      }
    }

    return `${formatted}@c.us`;
  }

  /**
   * Build product-specific prescription message
   */
  private buildPrescriptionMessage(data: PrescriptionMessageData): string {
    // Get product configuration
    const productConfig = getProductConfig(data.productName);

    if (!productConfig) {
      logger.warn(`Product configuration not found for ${data.productName}, using generic message`, {
        patientName: data.patientName,
        productName: data.productName,
      });
      return this.buildGenericFallbackMessage(data);
    }

    try {
      // Format prices with thousands separator
      const retailPriceFormatted = productConfig.retailPrice.toLocaleString('en-PK');
      const specialPriceFormatted = productConfig.specialPrice.toLocaleString('en-PK');

      // Generate product-specific message using template
      const message = productConfig.messageTemplate(
        data.patientName,
        data.doctorName,
        productConfig.dosage,
        retailPriceFormatted,
        specialPriceFormatted,
        productConfig.videoLink
      );

      return message;
    } catch (error) {
      logger.error('Error building product-specific message', {
        productName: data.productName,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildGenericFallbackMessage(data);
    }
  }

  /**
   * Fallback generic message if product config not found
   */
  private buildGenericFallbackMessage(data: PrescriptionMessageData): string {
    return `Dear ${data.patientName}, 👋

Dr. ${data.doctorName} has prescribed you ${data.productName}.

For more information about your prescription and pricing, please contact our support team.

*Team Dast e Yaar*
CCL Pharma | Patient Access & Support Program

━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ 📞 Call Dast e Yaar → tel:03248855666
2️⃣ 💬 Chat on WhatsApp → https://wa.me/923248855666`;
  }

  /**
   * Send WhatsApp message using GreenAPI
   */
  async sendPrescriptionMessage(data: PrescriptionMessageData): Promise<boolean> {
    try {
      const chatId = this.formatPhoneNumber(data.patientPhone);
      const message = this.buildPrescriptionMessage(data);

      logger.info(`Sending WhatsApp message to ${data.patientPhone}`, {
        chatId,
        patientName: data.patientName,
        mrn: data.mrn,
      });

      const endpoint = `/waInstance${this.idInstance}/sendMessage/${this.apiToken}`;

      const response = await this.apiClient.post<GreenAPIResponse>(endpoint, {
        chatId,
        message,
      });

      if (response.data && response.data.idMessage) {
        logger.info(`WhatsApp message sent successfully`, {
          messageId: response.data.idMessage,
          patientPhone: data.patientPhone,
          mrn: data.mrn,
        });
        return true;
      }

      logger.error(`Failed to send WhatsApp message - no message ID returned`, {
        patientPhone: data.patientPhone,
        mrn: data.mrn,
        response: response.data,
      });
      return false;
    } catch (error) {
      logger.error(`Error sending WhatsApp message via GreenAPI`, {
        patientPhone: data.patientPhone,
        mrn: data.mrn,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - we want to continue even if message fails
      return false;
    }
  }

  /**
   * Send a raw WhatsApp text message to any phone number (generic, used by
   * delivery notifications, rating requests, and inventory alerts).
   */
  async sendMessage(phone: string, message: string): Promise<boolean> {
    try {
      const chatId = this.formatPhoneNumber(phone);
      const endpoint = `/waInstance${this.idInstance}/sendMessage/${this.apiToken}`;

      const response = await this.apiClient.post<GreenAPIResponse>(endpoint, {
        chatId,
        message,
      });

      return !!(response.data && response.data.idMessage);
    } catch (error) {
      logger.error('Error sending generic WhatsApp message via GreenAPI', {
        phone,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Test GreenAPI connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const endpoint = `/waInstance${this.idInstance}/getSettings/${this.apiToken}`;
      const response = await this.apiClient.get(endpoint);

      if (response.status === 200) {
        logger.info('GreenAPI connection test successful');
        return true;
      }
      return false;
    } catch (error) {
      logger.error('GreenAPI connection test failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export default new GreenAPIService();
