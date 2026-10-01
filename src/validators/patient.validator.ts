import Joi from 'joi';

export const createPatientSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Patient name is required'
  }),
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im).required().messages({
    'string.pattern.base': 'Please provide a valid phone number',
    'any.required': 'Phone number is required'
  }),
  age: Joi.number().min(0).max(150).optional().messages({
    'number.min': 'Age cannot be negative',
    'number.max': 'Please provide a valid age'
  }),
  gender: Joi.string().valid('male', 'female', 'other').optional().messages({
    'any.only': 'Gender must be male, female, or other'
  }),
  city: Joi.string().max(100).optional().messages({
    'string.max': 'City name cannot exceed 100 characters'
  })
});

export const updatePatientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im).optional(),
  age: Joi.number().min(0).max(150).optional(),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  city: Joi.string().max(100).optional()
});

export const searchPatientSchema = Joi.object({
  search: Joi.string().min(1).optional().messages({
    'string.min': 'Search query must not be empty'
  })
});
