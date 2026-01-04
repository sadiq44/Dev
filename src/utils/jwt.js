import logger from '#config/logger.js';

import jwt from 'jsonwebtoken';


const JWT_SECRET=process.env.JWT_SECRET;

const JWT_EXPIRES_IN= '1d';


export const jwttoken= {
  sign: (payload) => {
    try {
      return jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
    } catch (e) {
      logger.e('Errot authentication',e);
      throw new Error('Failed to authenticat');
    }
  },
  verify: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      logger.error('Failed to verify', e);
      throw new Error('Failed to verify');  
    }
  }
};