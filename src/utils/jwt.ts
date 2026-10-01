import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: string;
  email: string;
  role?: string;
  assigned_districts?: string[];
}

export const generateAccessToken = (payload: TokenPayload): string => {
  // Token never expires - removed expiresIn
  return jwt.sign(payload, process.env.JWT_SECRET || '');
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  // Token never expires - removed expiresIn
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || '');
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET || '') as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || '') as TokenPayload;
};
