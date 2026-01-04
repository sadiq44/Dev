import logger from '#config/logger.js';
import bcrypt from 'bcrypt';

export const hashPassword= async (password) => {
  try {
    return await bcrypt.hash(password, 10);  
  } catch (error) {
    logger.error('Error hashing password: ${error}');
    throw new error('Error hashing');
  }
};