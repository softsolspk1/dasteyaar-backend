import Joi from "joi";

export const createPrescriptionSchema = Joi.object({
  patient_id: Joi.string().required().messages({
    "any.required": "Patient ID is required",
  }),
  prescription_text: Joi.string().max(5000).optional().allow("").messages({
    "string.max": "Prescription text cannot exceed 5000 characters",
  }),
  dosage_frequency: Joi.string()
    .valid("daily", "weekly", "fortnightly", "monthly")
    .optional()
    .messages({
      "any.only":
        "Dosage frequency must be daily, weekly, fortnightly, or monthly",
    }),
  duration_days: Joi.number().min(1).max(365).optional().messages({
    "number.min": "Duration must be at least 1 day",
    "number.max": "Duration cannot exceed 365 days",
  }),
  priority: Joi.string()
    .valid("normal", "urgent", "emergency")
    .default("normal")
    .messages({
      "any.only": "Priority must be normal, urgent, or emergency",
    }),
  selected_product: Joi.object({
    product_id: Joi.string().required().messages({
      "any.required": "Product ID is required",
    }),
    quantity: Joi.number().min(1).max(1000).required().messages({
      "number.min": "Quantity must be at least 1",
      "number.max": "Quantity cannot exceed 1000",
      "any.required": "Product quantity is required",
    }),
  })
    .required()
    .messages({
      "any.required": "Selected product is required",
    }),
  diagnosis: Joi.string().max(1000).optional().allow(""),
  notes: Joi.string().max(2000).optional().allow(""),
  city_id: Joi.string().optional().allow(""),
});

export const updatePrescriptionSchema = Joi.object({
  prescription_text: Joi.string().max(5000).optional(),
  duration_days: Joi.number().min(1).max(365).optional(),
  priority: Joi.string().valid("normal", "urgent", "emergency").optional(),
  diagnosis: Joi.string().max(1000).optional().allow(""),
  notes: Joi.string().max(2000).optional().allow(""),
});
