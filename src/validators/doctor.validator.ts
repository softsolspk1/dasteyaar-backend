import Joi from 'joi';

export const updateDoctorProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters'
  }),
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number'
  }),
  specialty: Joi.string().max(100).optional().messages({
    'string.max': 'Specialty cannot exceed 100 characters'
  })
});
