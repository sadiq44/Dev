import logger from '#config/logger.js';
import { signupSchema } from '#validations/auth.validation.js';
import { formatValidationError } from '#utils/format.js';


export const signup = async (req, res, next) => {
  try {
        
    const validationResult = signupSchema.safeParse(req.body); 

    if(!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(validationResult.error)
      });
    }

    const {name, email, role} = validationResult.data;  

    //Auth service

    logger.info('User registered succussfully: ${email}');

    res.status(201).json({
      message: 'User registered',
      Id: 1, name, email, role
    });
        

    

  } catch (error) {
    logger.error('signup error', error);
    if(error.message==='User with this email already exists') {
      return res.status(409).json({error: 'email already exists'});
    }
    next(error);  
  }
};